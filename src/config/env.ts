import "dotenv/config";
import { boolEnv, intEnv, requiredEnv } from "@/utils/env";

const nodeEnv = (process.env.NODE_ENV?.trim() || "production").toLowerCase();
const isDev = nodeEnv === "development" || nodeEnv === "dev";

export interface AppConfig {
  nodeEnv: string;
  isDev: boolean;
  appointmentUrl: string;
  cdpUrl: string;
  keepTabOnSlot: boolean;
  reuseTab: boolean;
  telegramBotToken: string;
  pollMinMs: number;
  pollMaxMs: number;
  alertCooldownMs: number;
  errorAlertThreshold: number;
  telegramChatId: string; // Admin / default chat ID
  allowedChatIds: string[];
}

const adminChatId = isDev
  ? process.env.DEV_TELEGRAM_CHAT_ID?.trim() || requiredEnv("TELEGRAM_CHAT_ID")
  : requiredEnv("TELEGRAM_CHAT_ID");

const parsedAllowed = (process.env.ALLOWED_CHAT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const allowedChatIds =
  parsedAllowed.length > 0
    ? Array.from(new Set([adminChatId, ...parsedAllowed]))
    : [];

export const config: AppConfig = {
  nodeEnv,
  isDev,
  appointmentUrl:
    process.env.APPOINTMENT_URL?.trim() || "http://localhost:3000",
  cdpUrl: process.env.CDP_URL?.trim() || "http://127.0.0.1:9222",
  keepTabOnSlot: boolEnv("KEEP_TAB_ON_SLOT", true),
  reuseTab: boolEnv("REUSE_TAB", true),
  telegramBotToken: requiredEnv("TELEGRAM_BOT_TOKEN"),
  telegramChatId: adminChatId,
  allowedChatIds,
  pollMinMs: intEnv("POLL_MIN_SEC", 15) * 1000,
  pollMaxMs: intEnv("POLL_MAX_SEC", 60) * 1000,
  alertCooldownMs: intEnv("ALERT_COOLDOWN_SEC", 300) * 1000,
  errorAlertThreshold: intEnv("ERROR_ALERT_THRESHOLD", 5),
};

if (config.pollMinMs > config.pollMaxMs) {
  throw new Error("POLL_MIN_SEC cannot be greater than POLL_MAX_SEC");
}
