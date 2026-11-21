import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import type {
  CheckStatus,
  ErrorReport,
  MonitorStats,
} from "@/types/monitor.types";
import type { TelegramInlineButton } from "@/types/telegram.types";

type NonErrorCheckStatus = Exclude<CheckStatus, "ERROR">;

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;
const MAX_CAPTION_LENGTH = 1024;

const STATUS_BADGE: Record<NonErrorCheckStatus, string> = {
  AVAILABLE: "🚨 Slots Available",
  NO_SLOTS: "ℹ️ No Slots",
  SESSION_EXPIRED: "⏳ Session Expired",
  REJECTED: "🚫 WAF / Rejected",
  IP_BLOCKED: "🛑 IP Blocked (24h)",
  UNKNOWN: "❓ Unknown Response",
};

export interface SendMessageOptions {
  chatId?: string;
  skipDevPrefix?: boolean;
  disable_notification?: boolean;
  screenshotPath?: string | null;
  reply_markup?: {
    inline_keyboard: TelegramInlineButton[][];
  };
}

export function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class TelegramService {
  private formatHtml(html: string, skipDevPrefix = false): string {
    if (config.isDev && !skipDevPrefix) {
      return `<b>[DEV]</b> ${html}`;
    }
    return html;
  }

  private async postJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!config.telegramBotToken) return;

    const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Telegram ${method} failed (${response.status}): ${body}`,
      );
    }
  }

  async sendPhoto(
    filePath: string,
    captionHtml?: string,
    options: Omit<SendMessageOptions, "screenshotPath"> = {},
  ): Promise<void> {
    if (!config.telegramBotToken) return;

    const chatId = options.chatId ?? config.telegramChatId;
    if (!chatId) return;

    const buffer = fs.readFileSync(filePath);
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append(
      "photo",
      new Blob([buffer], { type: "image/png" }),
      path.basename(filePath),
    );

    if (captionHtml) {
      form.append("caption", captionHtml);
      form.append("parse_mode", "HTML");
    }

    if (options.disable_notification) {
      form.append("disable_notification", "true");
    }

    if (options.reply_markup) {
      form.append("reply_markup", JSON.stringify(options.reply_markup));
    }

    const response = await fetch(`${TELEGRAM_API_BASE}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Telegram sendPhoto failed (${response.status}): ${body}`,
      );
    }
  }

  async sendMessage(
    html: string,
    options: SendMessageOptions = {},
  ): Promise<void> {
    if (!config.telegramBotToken) return;

    const chatId = options.chatId ?? config.telegramChatId;
    if (!chatId) return;

    const formatted = this.formatHtml(html, options.skipDevPrefix);
    const screenshotPath = options.screenshotPath;

    if (screenshotPath && fs.existsSync(screenshotPath)) {
      try {
        if (formatted.length <= MAX_CAPTION_LENGTH) {
          await this.sendPhoto(screenshotPath, formatted, options);
          return;
        }

        // Caption exceeds Telegram's 1024-char limit: send photo first, then full HTML text
        await this.sendPhoto(screenshotPath, undefined, {
          chatId,
          disable_notification: options.disable_notification,
        });
      } catch (err) {
        console.error(
          "[Telegram] Photo upload failed, falling back to text message:",
          err,
        );
      }
    }

    await this.postJson("sendMessage", {
      chat_id: chatId,
      text: formatted,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(options.disable_notification ? { disable_notification: true } : {}),
      ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
    });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    await this.postJson("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    }).catch(() => {});
  }

  async sendSlotAlert(params: {
    checkNumber: number;
    message: string;
    url: string;
    chatId?: string;
    details?: string;
    screenshotPath?: string | null;
  }): Promise<void> {
    const lines = [
      `<b>${STATUS_BADGE.AVAILABLE}</b> (Check #${params.checkNumber})`,
      escapeHtml(params.message),
      params.details ? `<b>Details:</b> ${escapeHtml(params.details)}` : null,
      `<b>URL:</b> ${escapeHtml(params.url)}`,
    ].filter((line): line is string => line !== null);

    await this.sendMessage(lines.join("\n"), {
      chatId: params.chatId,
      screenshotPath: params.screenshotPath,
    });
  }

  async sendCheckStatusUpdate(params: {
    checkNumber: number;
    status: NonErrorCheckStatus;
    applicantLabel: string;
    durationMs: number;
    message: string;
    url: string;
    screenshotPath?: string | null;
  }): Promise<void> {
    const badge = STATUS_BADGE[params.status];
    const lines = [
      `<b>${badge}</b> (Check #${params.checkNumber} · ${(params.durationMs / 1000).toFixed(1)}s)`,
      `<b>Applicant:</b> ${escapeHtml(params.applicantLabel)}`,
      escapeHtml(params.message),
      `<b>URL:</b> ${escapeHtml(params.url)}`,
    ];

    await this.sendMessage(lines.join("\n"), {
      disable_notification: params.status !== "AVAILABLE",
      screenshotPath: params.screenshotPath,
    });
  }

  async sendFailureAlert(params: {
    title: string;
    reason: string;
    stats: MonitorStats;
    errorReport?: ErrorReport;
    screenshotPath?: string | null;
  }): Promise<void> {
    const screenshotPath =
      params.screenshotPath ?? params.errorReport?.screenshotPath ?? null;

    const lines = [
      `<b>⚠️ ${escapeHtml(params.title)}</b>`,
      `<b>Reason:</b> ${escapeHtml(params.reason)}`,
      params.errorReport
        ? `<b>Check:</b> #${params.errorReport.checkNumber} (${(params.errorReport.durationMs / 1000).toFixed(1)}s)`
        : null,
      `<b>Streak:</b> ${params.stats.consecutiveFailures} | <b>Total checks:</b> ${params.stats.totalChecks}`,
    ].filter((line): line is string => line !== null);

    await this.sendMessage(lines.join("\n"), {
      screenshotPath,
    });
  }
  async setWebhook(url: string, secretToken?: string | null): Promise<void> {
    await this.postJson("setWebhook", {
      url,
      allowed_updates: ["message", "callback_query"],
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<void> {
    await this.postJson("deleteWebhook", {
      drop_pending_updates: dropPendingUpdates,
    });
  }
}

export const telegram = new TelegramService();
