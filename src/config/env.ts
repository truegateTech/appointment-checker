import "dotenv/config";
import { boolEnv, intEnv, requiredEnv } from "@/utils/env";

export interface AppConfig {
  appointmentUrl: string;
  nie: string;
  fullName: string;
  nationalityCode: string;
  procedureCode: string;
  cdpUrl: string;
  keepTabOnSlot: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  pollMinMs: number;
  pollMaxMs: number;
  alertCooldownMs: number;
  errorAlertThreshold: number;
}

export const config: AppConfig = {
  appointmentUrl:
    process.env.APPOINTMENT_URL?.trim() || "http://localhost:3000",
  nie: requiredEnv("NIE"),
  fullName: requiredEnv("FULL_NAME"),
  nationalityCode: requiredEnv("NATIONALITY_CODE"),
  procedureCode: process.env.PROCEDURE_CODE?.trim() || "4010",
  cdpUrl: process.env.CDP_URL?.trim() || "http://127.0.0.1:9222",
  keepTabOnSlot: boolEnv("KEEP_TAB_ON_SLOT", true),
  telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
  telegramChatId: requiredEnv("TELEGRAM_CHAT_ID"),
  pollMinMs: intEnv("POLL_MIN_SEC", 15) * 1000,
  pollMaxMs: intEnv("POLL_MAX_SEC", 60) * 1000,
  alertCooldownMs: intEnv("ALERT_COOLDOWN_SEC", 300) * 1000,
  errorAlertThreshold: intEnv("ERROR_ALERT_THRESHOLD", 5),
};

if (config.pollMinMs > config.pollMaxMs) {
  throw new Error("POLL_MIN_SEC cannot be greater than POLL_MAX_SEC");
}
