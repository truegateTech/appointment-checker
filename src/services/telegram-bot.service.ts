import { config } from "@/config/env";
import { catalogService } from "@/services/catalog.service";
import { dbService } from "@/services/db.service";
import { logger } from "@/services/logger.service";
import { escapeHtml, telegram } from "@/services/telegram.service";
import type {
  TelegramInlineButton,
  TelegramUpdate,
  WizardDraft,
} from "@/types/telegram.types";

const PAGE_SIZE = 6;

class TelegramBotService {
  private running = false;
  private offset = 0;
  private abortController: AbortController | null = null;
  private readonly drafts = new Map<string, WizardDraft>();

  private isAdmin(chatId: string): boolean {
    return chatId === config.telegramChatId;
  }

  private isAllowed(chatId: string): boolean {
    if (config.allowedChatIds.length === 0) return true;
    return config.allowedChatIds.includes(chatId);
  }

  //   start(): void {
  //     if (this.running) return;
  //     this.running = true;
  //     void this.pollLoop();
  //     console.log("Telegram Bot command listener started.");
  //   }

  //   stop(): void {
  //     this.running = false;
  //     this.abortController?.abort();
  //   }

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

  //   private async pollLoop(): Promise<void> {
  //     while (this.running) {
  //       try {
  //         this.abortController = new AbortController();
  //         const updates = await telegram.getUpdates(
  //           this.offset,
  //           this.abortController.signal,
  //         );

  //         for (const update of updates) {
  //           this.offset = update.update_id + 1;
  //           await this.handleUpdate(update).catch((err: unknown) =>
  //             console.error("Bot update error:", err),
  //           );
  //         }
  //       } catch (err: unknown) {
  //         if (!this.running) break;
  //         const msg = err instanceof Error ? err.message : String(err);
  //         console.warn("Telegram getUpdates retry in 3s:", msg);
  //         await new Promise((r) => setTimeout(r, 3000));
  //       }
  //     }
  //   }

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

    // Normalize commands and strip @bot_username suffix when triggered in groups
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
          `No slots: ${s.noSlots} | Expired: ${s.sessionExpired}`,
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

    await this.send(chatId, "<b>Step 1/5 — Select Province:</b>", rows);
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
      `<b>Step 2/5 — Select Procedure for ${escapeHtml(prov.name)}:</b>`,
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
      draft.step = "COUNTRY";

      await this.send(
        chatId,
        "<b>Step 3/5 — Applicant Nationality</b>\nType your country name (e.g. <code>India</code>, <code>Colombia</code>, <code>Argentina</code>) to search:",
      );
      return;
    }

    if (action === "nat" && draft) {
      const country = catalogService.getCountry(value);
      if (!country) return;
      draft.nationalityCode = country.code;
      draft.nationalityName = country.name;
      draft.step = "NIE";

      await this.send(
        chatId,
        `Selected: <b>${escapeHtml(country.name)}</b>\n\n<b>Step 4/5 — Enter NIE / Passport number:</b>`,
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
        !draft.procedureGroup ||
        !draft.nationalityCode ||
        !draft.nationalityName
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
        nationalityCode: draft.nationalityCode,
        nationalityName: draft.nationalityName,
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

    if (draft.step === "COUNTRY") {
      const matches = catalogService.searchCountries(text);
      if (matches.length === 0) {
        await this.send(chatId, "No country matched. Try another spelling:");
        return;
      }
      const rows: TelegramInlineButton[][] = matches.map((c) => [
        { text: `${c.name} (${c.code})`, callback_data: `nat:${c.code}` },
      ]);
      await this.send(chatId, "Tap your country below:", rows);
      return;
    }

    if (draft.step === "NIE") {
      draft.nie = text.toUpperCase();
      draft.step = "FULL_NAME";
      await this.send(
        chatId,
        "<b>Step 5/5 — Enter Full Name</b> (exactly as on NIE/Passport):",
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
          `<b>Nationality:</b> ${escapeHtml(draft.nationalityName)}`,
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
}

export const telegramBot = new TelegramBotService();
