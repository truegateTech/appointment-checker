import { checkNieSlots } from "@/checkers/slot-checker";
import { config } from "@/config/env";
import type { PageError } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { telegram } from "@/services/telegram.service";
import type { CheckStatus } from "@/types/monitor.types";
import { randomInt } from "@/utils/human";

const MAX_BACKOFF_MS = 10 * 60 * 1000;

export class SlotPoller {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private cursor = 0;

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
    console.log(`Next check in ${(delayMs / 1000).toFixed(1)}s...`);
    this.timer = setTimeout(() => {
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
    if (!this.running) return;

    const applicants = dbService.getActiveApplicants();
    if (applicants.length === 0) {
      console.log(
        "No active applicants in SQLite DB. Waiting for next tick...",
      );
      this.scheduleNext(randomInt(config.pollMinMs, config.pollMaxMs));
      return;
    }

    const applicant = applicants[this.cursor % applicants.length];
    this.cursor = (this.cursor + 1) % applicants.length;

    const startedAt = Date.now();
    let lastStatus: CheckStatus = "NO_SLOTS";

    try {
      const result = await checkNieSlots(applicant);
      const durationMs = Date.now() - startedAt;
      lastStatus = result.status;

      dbService.recordApplicantCheck(applicant.id, result.status);

      const entry = logger.recordCheck(
        {
          ...result,
          details: `Applicant: ${applicant.fullName} (${applicant.nie})${
            result.details ? ` | ${result.details}` : ""
          }`,
        },
        durationMs,
      );
      const stats = logger.getStats();

      if (result.status === "AVAILABLE") {
        await telegram.sendSlotAlert({
          checkNumber: entry.checkNumber,
          message: result.message,
          url: result.url,
          details: entry.details,
          screenshotPath: result.screenshotPath,
        });
      } else if (config.isDev) {
        await telegram
          .sendCheckStatusUpdate({
            checkNumber: entry.checkNumber,
            status: result.status,
            applicantLabel: `${applicant.fullName} (${applicant.nie})`,
            durationMs,
            message: result.message,
            url: result.url,
          })
          .catch((tgErr) =>
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
          .catch((tgErr) =>
            console.error("Failed to send Telegram rejection alert:", tgErr),
          );
      }
    } catch (err) {
      lastStatus = "ERROR";
      dbService.recordApplicantCheck(applicant.id, "ERROR");

      const error = (
        err instanceof Error ? err : new Error(String(err))
      ) as PageError;
      const report = logger.recordError(error, Date.now() - startedAt);
      const stats = logger.getStats();

      const shouldAlertError =
        config.isDev ||
        stats.consecutiveFailures === config.errorAlertThreshold;

      if (shouldAlertError) {
        await telegram
          .sendFailureAlert({
            title: "NIE Slot Monitor Error Report",
            reason: `[${applicant.nie}] ${report.message}`,
            stats,
            errorReport: report,
          })
          .catch((tgErr) =>
            console.error("Failed to send Telegram error alert:", tgErr),
          );
      }
    }

    const { consecutiveFailures } = logger.getStats();
    const delayMs = this.computeNextDelayMs(lastStatus, consecutiveFailures);
    this.scheduleNext(delayMs);

    if (!this.running) return;

    this.timer = setTimeout(() => {
      void this.runCycle();
    }, delayMs);
  }
}
