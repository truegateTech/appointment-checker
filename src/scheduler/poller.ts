import { checkNieSlots } from "@/checkers/slot-checker";
import { config } from "@/config/env";
import type { PageError } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { proxyService } from "@/services/proxy.service";
import { telegram } from "@/services/telegram.service";
import type { CheckStatus } from "@/types/monitor.types";
import {
  getActiveWindowStatus,
  getMadridDateKey,
  getMsUntilNextMadridDay,
} from "@/utils/schedule";

const MAX_BACKOFF_MS = 10 * 60 * 1000;
const MAX_PROXY_RETRIES = 2;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

    // Do not escalate error timers when rotating proxies (list or residential)
    if (proxyService.isEnabled()) {
      return baseDelay;
    }

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

  private async notifyDailyCapOnce(message: string): Promise<void> {
    const todayKey = getMadridDateKey();
    if (this.notifiedDailyCapDate === todayKey) return;

    this.notifiedDailyCapDate = todayKey;
    await telegram
      .sendMessage(message, { disable_notification: true })
      .catch(() => {});
  }

  private async runCycle(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;

    let lastStatus: CheckStatus = "NO_SLOTS";
    let ranCheck = false;
    let overrideDelayMs: number | null = null;

    try {
      // 1. Enforce Madrid active hours (bypassed in dev mode)
      const windowStatus = getActiveWindowStatus();
      if (!windowStatus.isActive) {
        if (config.isDev) {
          console.log(
            `[Schedule][DEV] Bypassing active-hours guard (${windowStatus.reason}).`,
          );
        } else {
          console.log(`[Schedule] ${windowStatus.reason}. Sleeping...`);
          overrideDelayMs = windowStatus.waitMs;
          return;
        }
      }

      // 2. Daily limit check (single-IP CDP cap OR static proxy pool capacity)
      if (!proxyService.isEnabled() && config.maxDailyChecks > 0) {
        const checksToday = logger.getChecksToday();
        if (checksToday >= config.maxDailyChecks) {
          const todayKey = getMadridDateKey();
          console.log(
            `[Rate Guard] Daily cap reached (${checksToday}/${config.maxDailyChecks}) for ${todayKey}. Waiting for next Madrid day...`,
          );
          await this.notifyDailyCapOnce(
            `<b>🛑 Daily Check Cap Reached (${checksToday}/${config.maxDailyChecks})</b>\nPaused until tomorrow's Madrid window.`,
          );
          overrideDelayMs = getMsUntilNextMadridDay();
          return;
        }
      }

      if (config.proxyMode === "list") {
        const capacity = proxyService.hasAvailableCapacity();
        if (!capacity.available) {
          if (capacity.allExhaustedToday) {
            console.log(
              "[Proxy] All static proxies reached their daily limit. Sleeping until tomorrow...",
            );
            await this.notifyDailyCapOnce(
              `<b>🛑 All Static Proxies Reached Daily Limit</b>\nPaused until tomorrow's Madrid window (${config.maxChecksPerProxyPerDay} checks/IP/day).`,
            );
            overrideDelayMs = getMsUntilNextMadridDay();
          } else {
            console.log(
              `[Proxy] Remaining proxies are cooling down. Waiting ${(capacity.nextCooldownWaitMs / 1000).toFixed(0)}s...`,
            );
            overrideDelayMs = capacity.nextCooldownWaitMs;
          }
          return;
        }
      }

      // 3. Pick next active applicant
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

      const applicantLabel = `${applicant.fullName} (${applicant.nie}) — ${applicant.provinceName}`;
      const maxAttempts = proxyService.isEnabled() ? MAX_PROXY_RETRIES + 1 : 1;
      const attemptedProxyIds = new Set<string>();

      // 4. Execute check; immediately switch to a fresh unique proxy on WAF/session/proxy error
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (!this.running) break;

        const selectedProxy = proxyService.acquire(attemptedProxyIds);
        if (proxyService.isEnabled() && !selectedProxy) {
          console.warn(
            `[Proxy] No unique proxy available for attempt ${attempt}/${maxAttempts}.`,
          );
          break;
        }

        if (selectedProxy) {
          attemptedProxyIds.add(selectedProxy.id);
          console.log(
            `[Proxy] Attempt ${attempt}/${maxAttempts} using ${selectedProxy.label}`,
          );
        }

        ranCheck = true;
        const startedAt = Date.now();

        try {
          const result = await checkNieSlots(applicant, selectedProxy);
          const durationMs = Date.now() - startedAt;
          lastStatus = result.status;

          const isRetryableStatus =
            result.status === "REJECTED" ||
            result.status === "IP_BLOCKED" ||
            result.status === "SESSION_EXPIRED";

          proxyService.reportOutcome(
            selectedProxy,
            result.status === "IP_BLOCKED"
              ? "IP_BLOCKED"
              : result.status === "REJECTED"
                ? "REJECTED"
                : result.status === "SESSION_EXPIRED"
                  ? "ERROR"
                  : "SUCCESS",
            isRetryableStatus ? result.message : undefined,
          );

          dbService.recordApplicantCheck(applicant.id, result.status);

          const detailParts = [
            `Applicant: ${applicantLabel}`,
            selectedProxy ? `Proxy: ${selectedProxy.label}` : null,
            result.details ?? null,
          ].filter((part): part is string => part !== null);

          const entry = logger.recordCheck(
            {
              ...result,
              details: detailParts.join(" | "),
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
            break;
          }

          if (config.isDev) {
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
                console.error(
                  "Failed to send Telegram rejection alert:",
                  tgErr,
                ),
              );
          }

          if (
            proxyService.isEnabled() &&
            isRetryableStatus &&
            attempt < maxAttempts
          ) {
            console.log(
              `[Poller] ${result.status} on ${selectedProxy?.id ?? "proxy"} — immediately retrying with a new proxy...`,
            );
            continue;
          }

          break;
        } catch (err: unknown) {
          lastStatus = "ERROR";
          const error = (
            err instanceof Error ? err : new Error(String(err))
          ) as PageError;

          proxyService.reportOutcome(selectedProxy, "ERROR", error.message);
          dbService.recordApplicantCheck(applicant.id, "ERROR");

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

          if (proxyService.isEnabled() && attempt < maxAttempts) {
            console.log(
              `[Poller] Error on ${selectedProxy?.id ?? "proxy"} (${error.message}) — immediately retrying with a new proxy...`,
            );
            continue;
          }

          break;
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
