import fs from "node:fs";
import path from "node:path";
import type {
  CheckLogEntry,
  ErrorReport,
  MonitorStats,
  SlotCheckResult,
} from "@/types/monitor.types";

const LOG_DIR = path.resolve("logs");
const SCREENSHOT_DIR = path.join(LOG_DIR, "screenshots");
const CHECKS_FILE = path.join(LOG_DIR, "checks.jsonl");
const ERRORS_FILE = path.join(LOG_DIR, "errors.jsonl");
const STATS_FILE = path.join(LOG_DIR, "stats.json");

class LoggerService {
  private stats: MonitorStats;

  constructor() {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    this.stats = this.loadStats();
  }

  private loadStats(): MonitorStats {
    if (fs.existsSync(STATS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(STATS_FILE, "utf8")) as MonitorStats;
      } catch {
        // Fallback to fresh stats if JSON is unreadable
      }
    }

    return {
      startedAt: new Date().toISOString(),
      totalChecks: 0,
      slotsAvailable: 0,
      noSlots: 0,
      sessionExpired: 0,
      rejected: 0,
      errors: 0,
      consecutiveFailures: 0,
      lastCheckAt: null,
      lastStatus: null,
    };
  }

  private saveStats(): void {
    fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2), "utf8");
  }

  private appendJsonLine(filePath: string, payload: unknown): void {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }

  getScreenshotPath(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(SCREENSHOT_DIR, `${prefix}-${stamp}.png`);
  }

  recordCheck(result: SlotCheckResult, durationMs: number): CheckLogEntry {
    const timestamp = new Date().toISOString();
    this.stats.totalChecks += 1;
    this.stats.lastCheckAt = timestamp;
    this.stats.lastStatus = result.status;

    switch (result.status) {
      case "AVAILABLE":
        this.stats.slotsAvailable += 1;
        this.stats.consecutiveFailures = 0;
        break;
      case "NO_SLOTS":
        this.stats.noSlots += 1;
        this.stats.consecutiveFailures = 0;
        break;
      case "SESSION_EXPIRED":
        this.stats.sessionExpired += 1;
        this.stats.consecutiveFailures = 0;
        break;
      case "REJECTED":
        this.stats.rejected += 1;
        this.stats.consecutiveFailures += 1;
        break;
    }

    const entry: CheckLogEntry = {
      timestamp,
      checkNumber: this.stats.totalChecks,
      status: result.status,
      durationMs,
      message: result.message,
      url: result.url,
      ...(result.details ? { details: result.details } : {}),
      ...(result.screenshotPath
        ? { screenshotPath: result.screenshotPath }
        : {}),
    };

    this.appendJsonLine(CHECKS_FILE, entry);
    this.saveStats();

    console.log(
      `[${timestamp}] #${entry.checkNumber} ${entry.status} (${durationMs}ms) — ${entry.message}`,
    );

    return entry;
  }

  recordError(
    error: Error & { screenshotPath?: string },
    durationMs: number,
  ): ErrorReport {
    const timestamp = new Date().toISOString();
    this.stats.totalChecks += 1;
    this.stats.errors += 1;
    this.stats.consecutiveFailures += 1;
    this.stats.lastCheckAt = timestamp;
    this.stats.lastStatus = "ERROR";

    const report: ErrorReport = {
      timestamp,
      checkNumber: this.stats.totalChecks,
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack ?? null,
      consecutiveFailures: this.stats.consecutiveFailures,
      durationMs,
      screenshotPath: error.screenshotPath ?? null,
    };

    this.appendJsonLine(ERRORS_FILE, report);
    this.saveStats();

    console.error(
      `[${timestamp}] #${report.checkNumber} ERROR (streak: ${report.consecutiveFailures}) — ${report.message}`,
    );

    return report;
  }

  getStats(): MonitorStats {
    return { ...this.stats };
  }
}

export const logger = new LoggerService();
