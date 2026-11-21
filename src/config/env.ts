import "dotenv/config";
import { boolEnv, intEnv, requiredEnv } from "@/utils/env";

const nodeEnv = (process.env.NODE_ENV?.trim() || "production").toLowerCase();
const isDev = nodeEnv === "development" || nodeEnv === "dev";

export type ProxyMode = "none" | "list" | "residential";

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
  webhookUrl: string | null;
  webhookPath: string;
  webhookPort: number;
  webhookSecret: string | null;
  maxDailyChecks: number;
  proxyMode: ProxyMode;
  webshareProxyListUrl: string | null;
  proxyListFile: string;
  maxChecksPerProxyPerDay: number;
  webshareResidentialHost: string;
  webshareResidentialPort: number;
  webshareResidentialUsername: string | null;
  webshareResidentialPassword: string | null;
  webshareResidentialCountry: string;
  headless: boolean;
  browserChannel: string;
  blockHeavyAssets: boolean;
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

const rawMaxDaily = Number.parseInt(process.env.MAX_CHECKS_PER_DAY ?? "5", 10);
const maxDailyChecks =
  Number.isFinite(rawMaxDaily) && rawMaxDaily >= 0 ? rawMaxDaily : 5;

const rawProxyMode = (process.env.PROXY_MODE?.trim() || "none").toLowerCase();
const proxyMode: ProxyMode =
  rawProxyMode === "list" || rawProxyMode === "residential"
    ? rawProxyMode
    : "none";

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
  webhookUrl:
    process.env.TELEGRAM_WEBHOOK_URL?.trim().replace(/\/+$/, "") || null,
  webhookPath: process.env.TELEGRAM_WEBHOOK_PATH?.trim() || "/telegram/webhook",
  webhookPort: intEnv("TELEGRAM_WEBHOOK_PORT", 3001),
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
  maxDailyChecks,
  proxyMode,
  webshareProxyListUrl: process.env.WEBSHARE_PROXY_LIST_URL?.trim() || null,
  proxyListFile: process.env.PROXY_LIST_FILE?.trim() || "data/proxies.txt",
  maxChecksPerProxyPerDay: intEnv("MAX_CHECKS_PER_PROXY_PER_DAY", 5),
  webshareResidentialHost:
    process.env.WEBSHARE_RESIDENTIAL_HOST?.trim() || "p.webshare.io",
  webshareResidentialPort: intEnv("WEBSHARE_RESIDENTIAL_PORT", 80),
  webshareResidentialUsername:
    process.env.WEBSHARE_RESIDENTIAL_USERNAME?.trim() || null,
  webshareResidentialPassword:
    process.env.WEBSHARE_RESIDENTIAL_PASSWORD?.trim() || null,
  webshareResidentialCountry:
    process.env.WEBSHARE_RESIDENTIAL_COUNTRY?.trim().toLowerCase() || "es",
  headless: boolEnv("HEADLESS", false),
  browserChannel: process.env.BROWSER_CHANNEL?.trim() || "chrome",
  blockHeavyAssets: boolEnv("BLOCK_HEAVY_ASSETS", true),
};

if (config.pollMinMs > config.pollMaxMs) {
  throw new Error("POLL_MIN_SEC cannot be greater than POLL_MAX_SEC");
}
