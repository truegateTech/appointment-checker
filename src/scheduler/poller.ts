import { checkNieSlots } from "@/checkers/slot-checker";
import { config } from "@/config/env";
import type { PageError } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { telegram } from "@/services/telegram.service";
import type { CheckStatus } from "@/types/monitor.types";
import { randomInt } from "@/utils/human";
import {
  getActiveWindowStatus,
  getMadridDateKey,
  getMsUntilNextMadridDay,
} from "@/utils/schedule";

const MAX_BACKOFF_MS = 10 * 60 * 1000;

export class SlotPoller {
  private running = false;
  private inFlight = false;
  private timer: NodeJS.Timeout | null = null;
  private cursor = 0;
  private notifiedDailyCapDate: string | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.runCycle();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log(`Next check in ${(delayMs / 1000).toFixed(1)}s...`);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runCycle();
    }, delayMs);
  }

  private computeNextDelayMs(
    status: CheckStatus,
    consecutiveFailures: number,
  ): number {
    const baseDelay = randomInt(config.pollMinMs, config.pollMaxMs);

    if (
      status === "REJECTED" ||
      status === "ERROR" ||
      consecutiveFailures > 0
    ) {
      const multiplier = Math.pow(2, Math.min(consecutiveFailures, 5));
      return Math.min(MAX_BACKOFF_MS, baseDelay * multiplier);
    }

    return baseDelay;
  }

  private async runCycle(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;

    let lastStatus: CheckStatus = "NO_SLOTS";
    let ranCheck = false;
    let overrideDelayMs: number | null = null;

    try {
      // 1. Enforce Madrid active hours: 07:30–22:00 weekdays, 09:00–22:00 weekends
      const windowStatus = getActiveWindowStatus();
      if (!windowStatus.isActive) {
        console.log(`[Schedule] ${windowStatus.reason}. Sleeping...`);
        overrideDelayMs = windowStatus.waitMs;
        return;
      }

      // 2. Enforce daily submission cap to avoid the portal's silent 5-tries/day shadow-limit
      if (config.maxDailyChecks > 0) {
        const checksToday = logger.getChecksToday();
        if (checksToday >= config.maxDailyChecks) {
          const todayKey = getMadridDateKey();
          console.log(
            `[Rate Guard] Daily cap reached (${checksToday}/${config.maxDailyChecks}) for ${todayKey}. Waiting for next Madrid day...`,
          );

          if (this.notifiedDailyCapDate !== todayKey) {
            this.notifiedDailyCapDate = todayKey;
            await telegram
              .sendMessage(
                `<b>🛑 Daily Check Cap Reached (${checksToday}/${config.maxDailyChecks})</b>\nPaused until tomorrow's Madrid window to avoid the portal's 5-tries/day silent limit.`,
                { disable_notification: true },
              )
              .catch(() => {});
          }

          overrideDelayMs = getMsUntilNextMadridDay();
          return;
        }
      }

      const applicants = dbService.getActiveApplicants();
      if (applicants.length === 0) {
        console.log(
          "No active applicants in SQLite DB. Waiting for next tick...",
        );
        return;
      }

      const applicant = applicants[this.cursor % applicants.length];
      if (!applicant) return;
      this.cursor = (this.cursor + 1) % applicants.length;
      ranCheck = true;

      const startedAt = Date.now();
      const applicantLabel = `${applicant.fullName} (${applicant.nie}) — ${applicant.provinceName}`;

      try {
        const result = await checkNieSlots(applicant);
        const durationMs = Date.now() - startedAt;
        lastStatus = result.status;

        dbService.recordApplicantCheck(applicant.id, result.status);

        const entry = logger.recordCheck(
          {
            ...result,
            details: `Applicant: ${applicantLabel}${
              result.details ? ` | ${result.details}` : ""
            }`,
          },
          durationMs,
        );
        const stats = logger.getStats();

        if (result.status === "AVAILABLE") {
          dbService.setActiveById(applicant.id, false);
          const recipientChatId = applicant.chatId ?? config.telegramChatId;

          await telegram.sendSlotAlert({
            checkNumber: entry.checkNumber,
            message: result.message,
            url: result.url,
            chatId: recipientChatId,
            details: entry.details,
            screenshotPath: result.screenshotPath,
          });

          if (recipientChatId !== config.telegramChatId) {
            await telegram
              .sendSlotAlert({
                checkNumber: entry.checkNumber,
                message: `[Admin Copy] ${result.message}`,
                url: result.url,
                chatId: config.telegramChatId,
                details: entry.details,
                screenshotPath: result.screenshotPath,
              })
              .catch(() => {});
          }
        } else if (config.isDev) {
          await telegram
            .sendCheckStatusUpdate({
              checkNumber: entry.checkNumber,
              status: result.status,
              applicantLabel,
              durationMs,
              message: result.message,
              url: result.url,
            })
            .catch((tgErr: unknown) =>
              console.error("Failed to send dev status notification:", tgErr),
            );
        } else if (
          result.status === "REJECTED" &&
          stats.consecutiveFailures === config.errorAlertThreshold
        ) {
          await telegram
            .sendFailureAlert({
              title: "Portal Repeatedly Rejecting Requests",
              reason: result.message,
              stats,
            })
            .catch((tgErr: unknown) =>
              console.error("Failed to send Telegram rejection alert:", tgErr),
            );
        }
      } catch (err: unknown) {
        lastStatus = "ERROR";
        dbService.recordApplicantCheck(applicant.id, "ERROR");

        const error = (
          err instanceof Error ? err : new Error(String(err))
        ) as PageError;
        const report = logger.recordError(error, Date.now() - startedAt);
        const stats = logger.getStats();

        if (
          config.isDev ||
          stats.consecutiveFailures === config.errorAlertThreshold
        ) {
          await telegram
            .sendFailureAlert({
              title: "NIE Slot Monitor Error Report",
              reason: `[${applicant.nie}] ${report.message}`,
              stats,
              errorReport: report,
            })
            .catch((tgErr: unknown) =>
              console.error("Failed to send Telegram error alert:", tgErr),
            );
        }
      }
    } finally {
      this.inFlight = false;
      if (this.running) {
        const delayMs =
          overrideDelayMs ??
          (ranCheck
            ? this.computeNextDelayMs(
                lastStatus,
                logger.getStats().consecutiveFailures,
              )
            : randomInt(config.pollMinMs, config.pollMaxMs));
        this.scheduleNext(delayMs);
      }
    }
  }
}
