import { SlotPoller } from "@/scheduler/poller";
import { browserService } from "@/services/browser.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { telegram } from "@/services/telegram.service";
import { telegramBot } from "./services/telegram-bot.service";

const poller = new SlotPoller();

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Stopping services cleanly...`);
  poller.stop();
  telegramBot.stop();
  await browserService.disconnect();
  dbService.close();
  console.log("Final stats:", logger.getStats());
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function main(): Promise<void> {
  console.log("Starting NIE Slot Monitor Service (TypeScript)...");

  await browserService.connect();
  console.log("Connected to Chrome over CDP.");

  await telegram
    .sendStartupNotice(logger.getStats())
    .catch((err: unknown) =>
      console.warn("Startup Telegram notice failed:", err),
    );

  telegramBot.start();
  poller.start();
}

main().catch((err: unknown) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
