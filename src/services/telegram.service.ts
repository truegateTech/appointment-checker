import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import type { MonitorStats, NonErrorCheckStatus } from "@/types/monitor.types";
import type {
  CheckStatusUpdateParams,
  FailureAlertParams,
  SendMessageOptions,
  SlotAlertParams,
  TelegramApiResponse,
  TelegramReplyMarkup,
  TelegramUpdate,
} from "@/types/telegram.types";

export function escapeHtml(text = ""): string {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function withEnvPrefix(htmlText: string): string {
  return config.isDev ? `<code>[DEV]</code> ${htmlText}` : htmlText;
}

const STATUS_BADGE: Record<NonErrorCheckStatus, string> = {
  AVAILABLE: "🚨 Slots Available",
  NO_SLOTS: "ℹ️ No Slots",
  SESSION_EXPIRED: "⏳ Session Expired",
  REJECTED: "🚫 WAF / Rejected",
  IP_BLOCKED: "🛑 IP Blocked (24h)",
  UNKNOWN: "❓ Unknown Response",
};

class TelegramService {
  private readonly apiBase = `https://api.telegram.org/bot${config.telegramBotToken}`;
  private readonly lastAlerts = new Map<string, number>();

  async callApi<T>(
    method: string,
    body: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<T> {
    const response = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const data = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !data.ok || data.result === undefined) {
      const retry = data.parameters?.retry_after
        ? ` (retry_after: ${data.parameters.retry_after}s)`
        : "";
      throw new Error(
        `Telegram ${method} error ${data.error_code ?? response.status}: ${data.description ?? "Unknown"}${retry}`,
      );
    }

    return data.result;
  }

  async setWebhook(url: string, secretToken?: string | null): Promise<boolean> {
    return this.callApi<boolean>("setWebhook", {
      url,
      allowed_updates: ["message", "callback_query"],
      ...(secretToken ? { secret_token: secretToken } : {}),
    });
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.callApi<boolean>("deleteWebhook", {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    await this.callApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
    }).catch(() => {});
  }

  async sendMessage(
    htmlText: string,
    options: SendMessageOptions = {},
  ): Promise<number> {
    const { chatId, skipDevPrefix = false, ...extra } = options;
    const text = (skipDevPrefix ? htmlText : withEnvPrefix(htmlText)).slice(
      0,
      4000,
    );

    const result = await this.callApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId ?? config.telegramChatId,
      text,
      parse_mode: "HTML",
      ...extra,
    });

    return result.message_id;
  }

  private async sendPhoto(
    filePath: string,
    captionHtml: string,
    chatId?: string,
    replyMarkup?: TelegramReplyMarkup,
  ): Promise<void> {
    const form = new FormData();
    const fileBytes = fs.readFileSync(filePath);
    const blob = new Blob([new Uint8Array(fileBytes)], { type: "image/png" });

    form.append("chat_id", chatId ?? config.telegramChatId);
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

  async sendSlotAlert(params: SlotAlertParams): Promise<{ skipped: boolean }> {
    const now = Date.now();
    const targetChatId = params.chatId ?? config.telegramChatId;
    const cooldownKey = `${targetChatId}:${params.message}|${params.url}`;
    const lastSentAt = this.lastAlerts.get(cooldownKey) ?? 0;

    if (!config.isDev && now - lastSentAt < config.alertCooldownMs) {
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
        ? "<i>The browser tab has been kept open in Chrome for booking.</i>"
        : null,
      "",
      `<a href="${escapeHtml(params.url)}">Open Appointment Portal</a>`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    const replyMarkup: TelegramReplyMarkup = {
      inline_keyboard: [[{ text: "🔗 Open Booking Page", url: params.url }]],
    };

    if (params.screenshotPath && fs.existsSync(params.screenshotPath)) {
      await this.sendPhoto(
        params.screenshotPath,
        caption,
        targetChatId,
        replyMarkup,
      ).catch(() =>
        this.sendMessage(caption, {
          chatId: targetChatId,
          reply_markup: replyMarkup,
        }),
      );
    } else {
      await this.sendMessage(caption, {
        chatId: targetChatId,
        reply_markup: replyMarkup,
      });
    }

    this.lastAlerts.set(cooldownKey, now);
    return { skipped: false };
  }

  async sendCheckStatusUpdate(params: CheckStatusUpdateParams): Promise<void> {
    const text = [
      `<b>${STATUS_BADGE[params.status]}</b> (Check #${params.checkNumber})`,
      `<b>Applicant:</b> ${escapeHtml(params.applicantLabel)}`,
      `<b>Result:</b> ${escapeHtml(params.message)}`,
      `<b>Duration:</b> ${(params.durationMs / 1000).toFixed(1)}s`,
      `<a href="${escapeHtml(params.url)}">Portal Link</a>`,
    ].join("\n");

    await this.sendMessage(text, {
      chatId: params.chatId,
      disable_notification: params.status === "NO_SLOTS",
      disable_web_page_preview: true,
    });
  }

  async sendFailureAlert(params: FailureAlertParams): Promise<void> {
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
      .filter((line): line is string => line !== null)
      .join("\n");

    const screenshotPath = params.errorReport?.screenshotPath;
    if (config.isDev && screenshotPath && fs.existsSync(screenshotPath)) {
      await this.sendPhoto(screenshotPath, text, params.chatId).catch(() =>
        this.sendMessage(text, { chatId: params.chatId }),
      );
      return;
    }

    await this.sendMessage(text, { chatId: params.chatId });
  }

  async sendStartupNotice(stats: MonitorStats): Promise<void> {
    const text = [
      `<b>✅ NIE Slot Monitor Started (${escapeHtml(config.nodeEnv)})</b>`,
      `<b>Poll window:</b> ${config.pollMinMs / 1000}s – ${config.pollMaxMs / 1000}s`,
      `<b>Verbose Telegram alerts:</b> ${config.isDev ? "ON (all checks)" : "OFF (slots & error threshold only)"}`,
      `<b>Logged checks so far:</b> ${stats.totalChecks}`,
    ].join("\n");

    await this.sendMessage(text, { disable_notification: true });
  }
}

export const telegram = new TelegramService();
