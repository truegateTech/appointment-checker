import "dotenv/config";
import { config } from "@/config/env";
import { SlotPoller } from "@/scheduler/poller";
import { browserService } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { proxyService } from "@/services/proxy.service";
import { getActiveWindowStatus, getMadridTime } from "@/utils/schedule";

const poller = new SlotPoller();
let shuttingDown = false;

function formatProxySummary(): string {
  if (config.proxyMode === "none") {
    const cap =
      config.maxDailyChecks > 0
        ? `${config.maxDailyChecks}/day single-IP cap`
        : "unlimited";
    return `none (CDP: ${config.cdpUrl}, ${cap})`;
  }

  if (config.proxyMode === "residential") {
    return `residential (${config.webshareResidentialHost}:${config.webshareResidentialPort}, country=${config.webshareResidentialCountry})`;
  }

  const perIpCap =
    config.maxChecksPerProxyPerDay > 0
      ? `${config.maxChecksPerProxyPerDay}/IP/day`
      : "unlimited";
  return `list (Webshare static pool, ${perIpCap})`;
}

function logStartupBanner(): void {
  const madrid = getMadridTime();
  const hh = String(madrid.hour).padStart(2, "0");
  const mm = String(madrid.minute).padStart(2, "0");
  const windowStatus = getActiveWindowStatus();

  const scheduleLine = windowStatus.isActive
    ? `ACTIVE (${madrid.weekday} ${hh}:${mm} Europe/Madrid)`
    : config.isDev
      ? `OUTSIDE HOURS (${madrid.weekday} ${hh}:${mm} Europe/Madrid) — BYPASSED in dev`
      : `PAUSED (${windowStatus.reason})`;

  const browserLine =
    config.proxyMode === "none"
      ? `CDP (${config.cdpUrl})`
      : `${config.browserChannel} (${config.headless ? "headless" : "headed/maximized"}, blockHeavyAssets=${config.blockHeavyAssets})`;

  const applicants = dbService.getActiveApplicants();

  console.log("========================================");
  console.log("  NIE Cita Slot Poller Starting");
  console.log("========================================");
  console.log(`Environment : ${config.isDev ? "development" : "production"}`);
  console.log(`Madrid Time : ${scheduleLine}`);
  console.log(`Proxy Mode  : ${formatProxySummary()}`);
  console.log(`Browser     : ${browserLine}`);
  console.log(
    `Poll Window : ${config.pollMinMs / 1000}s – ${config.pollMaxMs / 1000}s`,
  );
  console.log(`Applicants  : ${applicants.length} active in SQLite`);

  if (applicants.length === 0) {
    console.warn(
      "[Startup] No active applicants found. Add one via Telegram (/new) or `npm run db:seed`.",
    );
  } else {
    for (const a of applicants) {
      console.log(
        `  • #${a.id} ${a.fullName} (${a.nie}) — ${a.provinceName} [${a.procedureCode}]`,
      );
    }
  }
  console.log("========================================");
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[Shutdown] Received ${signal}. Stopping poller...`);
  poller.stop();

  try {
    await browserService.disconnect();
    console.log("[Shutdown] Browser disconnected.");
  } catch (err) {
    console.error("[Shutdown] Error disconnecting browser:", err);
  }

  try {
    dbService.close();
    console.log("[Shutdown] SQLite connection closed.");
  } catch (err) {
    console.error("[Shutdown] Error closing SQLite:", err);
  }

  process.exit(0);
}

async function main(): Promise<void> {
  logStartupBanner();

  await proxyService.init();

  console.log(
    config.proxyMode === "none"
      ? `[Browser] Connecting to existing Chrome via CDP (${config.cdpUrl})...`
      : `[Browser] Launching ${config.browserChannel} (${config.headless ? "headless" : "headed"}) with per-context proxy support...`,
  );
  await browserService.connect();
  console.log("[Browser] Ready.");

  poller.start();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception:", err);
  void shutdown("uncaughtException");
});

void main().catch(async (err: unknown) => {
  console.error("[Startup] Fatal error:", err);
  await browserService.disconnect().catch(() => {});
  dbService.close();
  process.exit(1);
});
