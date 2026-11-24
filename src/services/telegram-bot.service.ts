import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import { catalogService } from "@/services/catalog.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { escapeHtml, telegram } from "@/services/telegram.service";
import type { Applicant } from "@/types/applicant.types";
import type { SlotCheckResult } from "@/types/monitor.types";
import type {
  TelegramInlineButton,
  TelegramUpdate,
  WizardDraft,
} from "@/types/telegram.types";

const PAGE_SIZE = 6;
const MAX_CAPTION_LENGTH = 1024;

class TelegramBotService {
  private readonly drafts = new Map<string, WizardDraft>();

  private isAdmin(chatId: string): boolean {
    return chatId === config.telegramChatId;
  }

  private isAllowed(chatId: string): boolean {
    if (config.allowedChatIds.length === 0) return true;
    return config.allowedChatIds.includes(chatId);
  }

  private async send(
    chatId: string,
    html: string,
    inlineKeyboard?: TelegramInlineButton[][],
  ): Promise<void> {
    await telegram.sendMessage(html, {
      chatId,
      skipDevPrefix: true,
      ...(inlineKeyboard
        ? { reply_markup: { inline_keyboard: inlineKeyboard } }
        : {}),
    });
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const incomingChatId = update.callback_query?.message?.chat.id
      ? String(update.callback_query.message.chat.id)
      : update.message?.chat.id
        ? String(update.message.chat.id)
        : null;

    if (!incomingChatId) return;

    if (!this.isAllowed(incomingChatId)) {
      if (update.callback_query) {
        await telegram.answerCallbackQuery(update.callback_query.id);
      }
      await this.send(
        incomingChatId,
        `⛔ Access restricted. Share your Chat ID with the admin to get access:\n<code>${incomingChatId}</code>`,
      );
      return;
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      await telegram.answerCallbackQuery(cq.id);
      if (cq.data) {
        await this.handleCallback(incomingChatId, cq.data);
      }
      return;
    }

    const text = update.message?.text?.trim();
    if (!text) return;

    const command = text.split(/\s+/)[0]?.split("@")[0]?.toLowerCase();

    if (command === "/start" || command === "/help") {
      const lines = [
        "<b>🇪🇸 NIE Cita Alert Bot</b>",
        "",
        "/new — Set up a new appointment alert",
        "/list — View, pause, or delete your alerts",
        "/cancel — Cancel current setup",
        this.isAdmin(incomingChatId) ? "/stats — Live monitor stats" : null,
      ].filter((line): line is string => line !== null);

      await this.send(incomingChatId, lines.join("\n"));
      return;
    }

    if (command === "/cancel") {
      this.drafts.delete(incomingChatId);
      await this.send(incomingChatId, "Setup cancelled.");
      return;
    }

    if (command === "/stats") {
      if (!this.isAdmin(incomingChatId)) {
        await this.send(
          incomingChatId,
          "⛔ Only the admin can view global stats.",
        );
        return;
      }

      const s = logger.getStats();
      await this.send(
        incomingChatId,
        [
          "<b>📊 Monitor Stats</b>",
          `Total checks: <b>${s.totalChecks}</b>`,
          `Slots found: <b>${s.slotsAvailable}</b>`,
          `No slots: ${s.noSlots} | Expired: ${s.sessionExpired} | Unknown: ${s.unknown ?? 0}`,
          `WAF rejected: ${s.rejected} | Errors: ${s.errors}`,
          `Last status: <code>${s.lastStatus ?? "N/A"}</code>`,
        ].join("\n"),
      );
      return;
    }

    if (command === "/list") {
      await this.showUserAlerts(incomingChatId);
      return;
    }

    if (command === "/new") {
      this.drafts.set(incomingChatId, { step: "PROVINCE" });
      await this.showProvincePicker(incomingChatId, 0);
      return;
    }

    await this.handleWizardText(incomingChatId, text);
  }

  private async showProvincePicker(
    chatId: string,
    page: number,
  ): Promise<void> {
    const all = catalogService.getProvinces();
    const slice = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const rows: TelegramInlineButton[][] = slice.map((p) => [
      {
        text: `📍 ${p.name} (${p.procedures.length})`,
        callback_data: `p:${p.code}`,
      },
    ]);

    const nav: TelegramInlineButton[] = [];
    if (page > 0)
      nav.push({ text: "⬅️ Prev", callback_data: `pp:${page - 1}` });
    if ((page + 1) * PAGE_SIZE < all.length) {
      nav.push({ text: "Next ➡️", callback_data: `pp:${page + 1}` });
    }
    if (nav.length > 0) rows.push(nav);

    await this.send(chatId, "<b>Step 1/4 — Select Province:</b>", rows);
  }

  private async showProcedurePicker(
    chatId: string,
    provinceCode: string,
    page: number,
  ): Promise<void> {
    const prov = catalogService.getProvince(provinceCode);
    if (!prov) {
      await this.send(chatId, "Province not found. Send /new to restart.");
      return;
    }

    const slice = prov.procedures.slice(
      page * PAGE_SIZE,
      (page + 1) * PAGE_SIZE,
    );
    const rows: TelegramInlineButton[][] = slice.map((pr) => [
      { text: pr.name.slice(0, 58), callback_data: `pr:${pr.code}` },
    ]);

    const nav: TelegramInlineButton[] = [];
    if (page > 0)
      nav.push({ text: "⬅️ Prev", callback_data: `prp:${page - 1}` });
    if ((page + 1) * PAGE_SIZE < prov.procedures.length) {
      nav.push({ text: "Next ➡️", callback_data: `prp:${page + 1}` });
    }
    if (nav.length > 0) rows.push(nav);

    await this.send(
      chatId,
      `<b>Step 2/4 — Select Procedure for ${escapeHtml(prov.name)}:</b>`,
      rows,
    );
  }

  private async handleCallback(chatId: string, data: string): Promise<void> {
    const [action, value] = data.split(":");
    if (!action || value === undefined) return;

    const draft = this.drafts.get(chatId);

    if (action === "pp") {
      await this.showProvincePicker(chatId, Number(value));
      return;
    }

    if (action === "p") {
      const prov = catalogService.getProvince(value);
      if (!prov) return;
      this.drafts.set(chatId, {
        step: "PROCEDURE",
        provinceCode: prov.code,
        provinceName: prov.name,
        provinceUrl: prov.url,
      });
      await this.showProcedurePicker(chatId, prov.code, 0);
      return;
    }

    if (action === "prp" && draft?.provinceCode) {
      await this.showProcedurePicker(chatId, draft.provinceCode, Number(value));
      return;
    }

    if (action === "pr" && draft?.provinceCode) {
      const proc = catalogService.getProcedure(draft.provinceCode, value);
      if (!proc) return;
      draft.procedureCode = proc.code;
      draft.procedureName = proc.name;
      draft.procedureGroup = proc.selectName;
      draft.step = "NIE";

      await this.send(
        chatId,
        `Selected: <b>${escapeHtml(proc.name)}</b>\n\n<b>Step 3/4 — Enter NIE / Passport number:</b>`,
      );
      return;
    }

    if (action === "save" && draft?.step === "CONFIRM") {
      if (
        !draft.fullName ||
        !draft.nie ||
        !draft.provinceCode ||
        !draft.provinceName ||
        !draft.provinceUrl ||
        !draft.procedureCode ||
        !draft.procedureName ||
        !draft.procedureGroup
      ) {
        await this.send(
          chatId,
          "Incomplete details. Please send /new to start again.",
        );
        this.drafts.delete(chatId);
        return;
      }

      const saved = dbService.createApplicant({
        fullName: draft.fullName,
        nie: draft.nie,
        provinceCode: draft.provinceCode,
        provinceName: draft.provinceName,
        provinceUrl: draft.provinceUrl,
        procedureCode: draft.procedureCode,
        procedureName: draft.procedureName,
        procedureGroup: draft.procedureGroup,
        chatId,
      });
      this.drafts.delete(chatId);

      await this.send(
        chatId,
        `✅ <b>Alert #${saved.id} Activated!</b>\nMonitoring <b>${escapeHtml(saved.provinceName)}</b> — ${escapeHtml(saved.procedureName)} for <b>${escapeHtml(saved.fullName)}</b>.`,
      );
      return;
    }

    if (action === "tog") {
      const updated = dbService.toggleById(
        Number(value),
        chatId,
        this.isAdmin(chatId),
      );
      if (updated) {
        await this.send(
          chatId,
          `Alert #${updated.id} is now <b>${updated.isActive ? "ACTIVE ▶️" : "PAUSED ⏸"}</b>.`,
        );
      }
      return;
    }

    if (action === "del") {
      const deleted = dbService.deleteById(
        Number(value),
        chatId,
        this.isAdmin(chatId),
      );
      if (deleted) {
        await this.send(chatId, `🗑 Deleted alert #${value}.`);
      }
    }
  }

  private async handleWizardText(chatId: string, text: string): Promise<void> {
    const draft = this.drafts.get(chatId);
    if (!draft) return;

    if (draft.step === "NIE") {
      draft.nie = text.toUpperCase();
      draft.step = "FULL_NAME";
      await this.send(
        chatId,
        "<b>Step 4/4 — Enter Full Name</b> (exactly as on NIE/Passport):",
      );
      return;
    }

    if (draft.step === "FULL_NAME") {
      draft.fullName = text.toUpperCase();
      draft.step = "CONFIRM";

      await this.send(
        chatId,
        [
          "<b>Confirm Alert Details</b>",
          "",
          `<b>Province:</b> ${escapeHtml(draft.provinceName)}`,
          `<b>Procedure:</b> ${escapeHtml(draft.procedureName)}`,
          `<b>NIE:</b> <code>${escapeHtml(draft.nie)}</code>`,
          `<b>Name:</b> ${escapeHtml(draft.fullName)}`,
        ].join("\n"),
        [[{ text: "✅ Confirm & Start Alert", callback_data: "save:1" }]],
      );
    }
  }

  private async showUserAlerts(chatId: string): Promise<void> {
    const list = dbService.getByChatId(chatId);
    if (list.length === 0) {
      await this.send(
        chatId,
        "No alerts configured yet. Send /new to create one.",
      );
      return;
    }

    for (const item of list) {
      const statusIcon = item.isActive ? "🟢 ACTIVE" : "⏸ PAUSED";
      await this.send(
        chatId,
        [
          `<b>#${item.id} — ${statusIcon}</b>`,
          `<b>${escapeHtml(item.provinceName)}</b> | ${escapeHtml(item.procedureName)}`,
          `Applicant: ${escapeHtml(item.fullName)} (<code>${escapeHtml(item.nie)}</code>)`,
          `Last check: <code>${item.lastStatus ?? "Pending"}</code>`,
        ].join("\n"),
        [
          [
            {
              text: item.isActive ? "⏸ Pause" : "▶️ Resume",
              callback_data: `tog:${item.id}`,
            },
            { text: "🗑 Delete", callback_data: `del:${item.id}` },
          ],
        ],
      );
    }
  }

  // ── Self-contained alert notification via dedicated ALERT_BOT_TOKEN ──
  // These methods do NOT modify or depend on TelegramService internals (OCP).
  // They use their own HTTP calls with the alert bot token, keeping SRP intact.

  private get alertBotToken(): string {
    return process.env.ALERT_BOT_TOKEN || config.telegramBotToken;
  }

  private get alertApiBase(): string {
    return `https://api.telegram.org/bot${this.alertBotToken}`;
  }

  private async postAlertJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.alertBotToken) return;

    const response = await fetch(`${this.alertApiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Alert bot ${method} failed (${response.status}): ${body}`,
      );
    }
  }

  private async sendAlertPhoto(
    chatId: string,
    filePath: string,
    captionHtml?: string,
    disableNotification?: boolean,
  ): Promise<void> {
    if (!this.alertBotToken) return;

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

    if (disableNotification) {
      form.append("disable_notification", "true");
    }

    const response = await fetch(`${this.alertApiBase}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Alert bot sendPhoto failed (${response.status}): ${body}`,
      );
    }
  }

  private async sendAlertMessage(
    chatId: string,
    html: string,
    options?: {
      screenshotPath?: string | null;
      disableNotification?: boolean;
    },
  ): Promise<void> {
    const screenshotPath = options?.screenshotPath;

    if (screenshotPath && fs.existsSync(screenshotPath)) {
      try {
        if (html.length <= MAX_CAPTION_LENGTH) {
          await this.sendAlertPhoto(
            chatId,
            screenshotPath,
            html,
            options?.disableNotification,
          );
          return;
        }

        await this.sendAlertPhoto(
          chatId,
          screenshotPath,
          undefined,
          options?.disableNotification,
        );
      } catch (err) {
        console.error(
          "[AlertBot] Photo upload failed, falling back to text:",
          err,
        );
      }
    }

    await this.postAlertJson("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(options?.disableNotification ? { disable_notification: true } : {}),
    });
  }

  async sendAlertNotification(params: {
    rawLabel: string;
    isGenuine: boolean;
    result: SlotCheckResult;
    applicant: Applicant;
  }): Promise<void> {
    const { rawLabel, isGenuine, result, applicant } = params;
    const verifiedAt = new Date().toISOString();
    const applicantLabel = `${applicant.fullName} (${applicant.nie})`;

    const htmlMessage = isGenuine
      ? [
          `<b>🚨 ALERT CONFIRMED: GENUINE SLOTS FOUND!</b>`,
          `<b>Target:</b> ${escapeHtml(rawLabel)}`,
          `<b>Status:</b> ${escapeHtml(result.message)}`,
          result.details
            ? `<b>Details:</b> ${escapeHtml(result.details)}`
            : null,
          `<b>URL:</b> ${escapeHtml(result.url)}`,
          `<b>Applicant:</b> ${escapeHtml(applicantLabel)}`,
          `<b>Verified At:</b> ${verifiedAt}`,
        ]
          .filter((line): line is string => line !== null)
          .join("\n")
      : [
          `<b>⚠️ ALERT VERIFIED: FAKE / NO SLOTS</b>`,
          `<b>Target:</b> ${escapeHtml(rawLabel)}`,
          `<b>Result:</b> ${escapeHtml(result.message)}`,
          `<b>Status:</b> <code>${escapeHtml(result.status)}</code>`,
          result.details
            ? `<b>Details:</b> ${escapeHtml(result.details)}`
            : null,
          `<b>URL:</b> ${escapeHtml(result.url)}`,
          `<b>Applicant:</b> ${escapeHtml(applicantLabel)}`,
          `<b>Checked At:</b> ${verifiedAt}`,
        ]
          .filter((line): line is string => line !== null)
          .join("\n");

    const recipientChatId = applicant.chatId ?? config.telegramChatId;
    await this.sendAlertMessage(recipientChatId, htmlMessage, {
      screenshotPath: result.screenshotPath,
      disableNotification: !isGenuine,
    });

    // Send admin copy if the recipient is not the admin
    if (
      recipientChatId &&
      config.telegramChatId &&
      recipientChatId !== config.telegramChatId
    ) {
      await this.sendAlertMessage(
        config.telegramChatId,
        `<b>[Admin Copy]</b>\n${htmlMessage}`,
        {
          screenshotPath: result.screenshotPath,
          disableNotification: !isGenuine,
        },
      ).catch(() => {});
    }
  }

  async sendVerificationError(params: {
    rawLabel: string;
    error: unknown;
    chatId?: string | null;
  }): Promise<void> {
    const errMessage =
      params.error instanceof Error
        ? params.error.message
        : String(params.error);
    const targetChatId = params.chatId ?? config.telegramChatId;
    await this.sendAlertMessage(
      targetChatId,
      `<b>❌ Verification Error for ${escapeHtml(params.rawLabel)}</b>\n<code>${escapeHtml(errMessage)}</code>`,
    ).catch(() => {});
  }
}

export const telegramBot = new TelegramBotService();
