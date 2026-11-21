import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import type {
  CheckLogEntry,
  ErrorReport,
  MonitorStats,
  ProxyDevLogEntry,
  SlotCheckResult,
} from "@/types/monitor.types";
import { getMadridDateKey } from "@/utils/schedule";

const LOG_DIR = path.resolve("logs");
const SCREENSHOT_DIR = path.join(LOG_DIR, "screenshots");
const CHECKS_FILE = path.join(LOG_DIR, "checks.jsonl");
const ERRORS_FILE = path.join(LOG_DIR, "errors.jsonl");
const PROXY_DEV_LOG_FILE = path.join(LOG_DIR, "proxy-dev.jsonl");
const STATS_FILE = path.join(LOG_DIR, "stats.json");

class LoggerService {
  private stats: MonitorStats;

  constructor() {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    this.stats = this.loadStats();
    this.syncDailyCounter();
  }

  private createDefaultStats(): MonitorStats {
    return {
      startedAt: new Date().toISOString(),
      totalChecks: 0,
      slotsAvailable: 0,
      noSlots: 0,
      sessionExpired: 0,
      rejected: 0,
      unknown: 0,
      errors: 0,
      consecutiveFailures: 0,
      lastCheckAt: null,
      lastStatus: null,
      dailyDate: getMadridDateKey(),
      checksToday: 0,
    };
  }

  private loadStats(): MonitorStats {
    const defaults = this.createDefaultStats();

    if (fs.existsSync(STATS_FILE)) {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(STATS_FILE, "utf8"),
        ) as Partial<MonitorStats>;
        return {
          ...defaults,
          ...parsed,
        };
      } catch {
        // Fallback to clean stats if stats.json is corrupted
      }
    }

    return defaults;
  }

  private saveStats(): void {
    fs.writeFileSync(STATS_FILE, JSON.stringify(this.stats, null, 2), "utf8");
  }

  private appendJsonLine(filePath: string, payload: unknown): void {
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }

  private syncDailyCounter(): void {
    const today = getMadridDateKey();
    if (this.stats.dailyDate !== today) {
      this.stats.dailyDate = today;
      this.stats.checksToday = 0;
      this.saveStats();
    }
  }

  getScreenshotPath(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(SCREENSHOT_DIR, `${prefix}-${stamp}.png`);
  }

  getChecksToday(): number {
    this.syncDailyCounter();
    return this.stats.checksToday;
  }

  recordProxyDevLog(entry: ProxyDevLogEntry): void {
    if (!config.isDev) return;

    this.appendJsonLine(PROXY_DEV_LOG_FILE, entry);

    const probe =
      entry.probeLatencyMs !== null ? `${entry.probeLatencyMs}ms` : "n/a";
    const ttfb =
      entry.portalTtfbMs !== null ? `${entry.portalTtfbMs}ms` : "n/a";
    const http = entry.portalHttpStatus ?? "n/a";

    console.log(
      [
        `[Proxy][DEV] mode=${entry.mode}`,
        `server=${entry.server}`,
        `user=${entry.username ?? "none"}`,
        `exitIp=${entry.exitIp ?? "unknown"}`,
        `probe=${probe}`,
        `portalTTFB=${ttfb} (HTTP ${http})`,
        `total=${entry.totalDurationMs}ms`,
        `outcome=${entry.outcome}`,
        entry.error ? `err="${entry.error}"` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" | "),
    );
  }

  recordCheck(result: SlotCheckResult, durationMs: number): CheckLogEntry {
    this.syncDailyCounter();

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
      case "UNKNOWN":
        this.stats.unknown += 1;
        this.stats.consecutiveFailures = 0;
        break;
      case "REJECTED":
        this.stats.rejected += 1;
        this.stats.consecutiveFailures += 1;
        break;
    }

    if (result.status !== "REJECTED") {
      this.stats.checksToday += 1;
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
      `[${timestamp}] #${entry.checkNumber} ${entry.status} (${durationMs}ms | today: ${this.stats.checksToday}) — ${entry.message}`,
    );

    return entry;
  }

  recordError(
    error: Error & { screenshotPath?: string },
    durationMs: number,
  ): ErrorReport {
    this.syncDailyCounter();

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
    this.syncDailyCounter();
    return { ...this.stats };
  }
}

export const logger = new LoggerService();
