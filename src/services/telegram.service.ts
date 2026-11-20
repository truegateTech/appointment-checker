import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import type {
  CheckStatus,
  ErrorReport,
  MonitorStats,
} from "@/types/monitor.types";

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

function escapeHtml(text = ""): string {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function withEnvPrefix(htmlText: string): string {
  return config.isDev ? `<code>[DEV]</code> ${htmlText}` : htmlText;
}

const STATUS_BADGE: Record<Exclude<CheckStatus, "ERROR">, string> = {
  AVAILABLE: "🚨 AVAILABLE",
  NO_SLOTS: "ℹ️ NO SLOTS",
  SESSION_EXPIRED: "⏳ SESSION EXPIRED",
  REJECTED: "⛔ WAF REJECTED",
};

class TelegramService {
  private readonly apiBase = `https://api.telegram.org/bot${config.telegramBotToken}`;
  private lastSlotAlertAt = 0;
  private lastAlertSignature = "";

  async sendMessage(
    htmlText: string,
    extra: Record<string, unknown> = {},
  ): Promise<number | undefined> {
    const response = await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: withEnvPrefix(htmlText).slice(0, 4000),
        parse_mode: "HTML",
        ...extra,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json()) as TelegramApiResponse;
    if (!response.ok || !data.ok) {
      const retry = data.parameters?.retry_after
        ? ` (retry_after: ${data.parameters.retry_after}s)`
        : "";
      throw new Error(
        `Telegram API error ${data.error_code ?? response.status}: ${data.description ?? "Unknown"}${retry}`,
      );
    }

    return data.result?.message_id;
  }

  private async sendPhoto(
    filePath: string,
    captionHtml: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    const form = new FormData();
    const fileBytes = fs.readFileSync(filePath);
    const blob = new Blob([fileBytes], { type: "image/png" });

    form.append("chat_id", config.telegramChatId);
    form.append("photo", blob, path.basename(filePath));
    form.append("caption", withEnvPrefix(captionHtml).slice(0, 1000));
    form.append("parse_mode", "HTML");
    if (replyMarkup) {
      form.append("reply_markup", JSON.stringify(replyMarkup));
    }

    const response = await fetch(`${this.apiBase}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await response.json()) as TelegramApiResponse;
    if (!response.ok || !data.ok) {
      throw new Error(
        `Telegram sendPhoto failed (${data.error_code ?? response.status}): ${data.description ?? "Unknown"}`,
      );
    }
  }

  async sendSlotAlert(params: {
    checkNumber: number;
    message: string;
    url: string;
    details?: string;
    screenshotPath?: string;
  }): Promise<{ skipped: boolean }> {
    const now = Date.now();
    const signature = `${params.message}|${params.url}`;
    const inCooldown = now - this.lastSlotAlertAt < config.alertCooldownMs;

    // Bypass cooldown in dev so every test hit delivers immediately
    if (!config.isDev && inCooldown && signature === this.lastAlertSignature) {
      return { skipped: true };
    }

    const timeMadrid = new Date().toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
    });

    const caption = [
      "<b>🚨 NIE APPOINTMENT SLOTS AVAILABLE!</b>",
      "",
      `<b>Status:</b> ${escapeHtml(params.message)}`,
      params.details ? `<b>Details:</b> ${escapeHtml(params.details)}` : null,
      `<b>Check #:</b> ${params.checkNumber}`,
      `<b>Spain Time:</b> ${escapeHtml(timeMadrid)}`,
      config.keepTabOnSlot
        ? "<i>The browser tab has been kept open in Chrome.</i>"
        : null,
      "",
      `<a href="${escapeHtml(params.url)}">Open Appointment Portal</a>`,
    ]
      .filter(Boolean)
      .join("\n");

    const replyMarkup = {
      inline_keyboard: [[{ text: "🔗 Open Booking Page", url: params.url }]],
    };

    if (params.screenshotPath && fs.existsSync(params.screenshotPath)) {
      await this.sendPhoto(params.screenshotPath, caption, replyMarkup).catch(
        () => this.sendMessage(caption, { reply_markup: replyMarkup }),
      );
    } else {
      await this.sendMessage(caption, { reply_markup: replyMarkup });
    }

    this.lastSlotAlertAt = now;
    this.lastAlertSignature = signature;
    return { skipped: false };
  }

  async sendCheckStatusUpdate(params: {
    checkNumber: number;
    status: Exclude<CheckStatus, "ERROR">;
    applicantLabel: string;
    durationMs: number;
    message: string;
    url: string;
  }): Promise<void> {
    const text = [
      `<b>${STATUS_BADGE[params.status]}</b> (Check #${params.checkNumber})`,
      `<b>Applicant:</b> ${escapeHtml(params.applicantLabel)}`,
      `<b>Result:</b> ${escapeHtml(params.message)}`,
      `<b>Duration:</b> ${(params.durationMs / 1000).toFixed(1)}s`,
      `<a href="${escapeHtml(params.url)}">Portal Link</a>`,
    ].join("\n");

    await this.sendMessage(text, {
      disable_notification: params.status === "NO_SLOTS",
      disable_web_page_preview: true,
    });
  }

  async sendFailureAlert(params: {
    title: string;
    reason: string;
    stats: MonitorStats;
    errorReport?: ErrorReport;
  }): Promise<void> {
    const text = [
      `<b>⚠️ ${escapeHtml(params.title)}</b>`,
      "",
      `<b>Consecutive failures:</b> ${params.stats.consecutiveFailures}`,
      `<b>Reason:</b> <code>${escapeHtml(params.reason)}</code>`,
      `<b>Stats:</b> Total ${params.stats.totalChecks} | No slots: ${params.stats.noSlots} | Rejected: ${params.stats.rejected} | Errors: ${params.stats.errors}`,
      params.errorReport?.screenshotPath
        ? `<b>Screenshot:</b> <code>${escapeHtml(params.errorReport.screenshotPath)}</code>`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const screenshotPath = params.errorReport?.screenshotPath;
    if (config.isDev && screenshotPath && fs.existsSync(screenshotPath)) {
      await this.sendPhoto(screenshotPath, text).catch(() =>
        this.sendMessage(text),
      );
      return;
    }

    await this.sendMessage(text);
  }

  async sendStartupNotice(stats: MonitorStats): Promise<void> {
    const text = [
      `<b>✅ NIE Slot Monitor Started (${escapeHtml(config.nodeEnv)})</b>`,
      `<b>Portal:</b> ${escapeHtml(config.appointmentUrl)}`,
      `<b>Poll window:</b> ${config.pollMinMs / 1000}s – ${config.pollMaxMs / 1000}s`,
      `<b>Verbose Telegram alerts:</b> ${config.isDev ? "ON (all checks)" : "OFF (slots & error threshold only)"}`,
      `<b>Logged checks so far:</b> ${stats.totalChecks}`,
    ].join("\n");

    await this.sendMessage(text, { disable_notification: true });
  }
}

export const telegram = new TelegramService();
