import { SlotPoller } from "@/scheduler/poller";
import { browserService } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { telegram } from "@/services/telegram.service";

const poller = new SlotPoller();

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Poller] Received ${signal}. Shutting down cleanly...`);
  poller.stop();
  await browserService.disconnect();
  dbService.close();
  console.log("Final stats:", logger.getStats());
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function main(): Promise<void> {
  console.log("[Poller] Starting NIE Slot Monitor (Single-Execution Mode)...");

  await browserService.connect();
  console.log("[Poller] Connected to Chrome over CDP.");

  await telegram
    .sendStartupNotice(logger.getStats())
    .catch((err: unknown) =>
      console.warn("Startup Telegram notice failed:", err),
    );

  poller.start();
}

main().catch((err: unknown) => {
  console.error("[Poller] Fatal startup error:", err);
  process.exit(1);
});
