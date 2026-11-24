// src/listener.ts
import "dotenv/config";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { NewMessage, NewMessageEvent } from "teleproto/events";
import { checkNieSlots } from "./checkers/slot-checker";
import { catalogService } from "./services/catalog.service";
import { dbService } from "./services/db.service";
import { telegramBot } from "./services/telegram-bot.service";
import type { Applicant } from "./types/applicant.types";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH!;
const sessionString = new StringSession(process.env.TG_SESSION_STRING!);

// Replace with the exact @username or numeric chat ID of the Cita Ping bot/channel
const ALERT_SOURCE = process.env.CITAPING_CHAT_USERNAME!;

// Prevent overlapping browser runs & burning portal rate limits
const COOLDOWN_MS = 2 * 60 * 1000;
const recentChecks = new Map<string, number>();
let isChecking = false;

interface ParsedAlert {
  provinceId: string;
  officeId?: string;
  procedureId: string;
  rawLabel: string;
}

// Map text keywords from the alert to official icp.administracionelectronica.gob.es IDs
function parseAlertMessage(text: string): ParsedAlert | null {
  const normalized = text.toLowerCase();

  // Example mapping — expand using your province/procedure ID lookup table
  if (normalized.includes("huellas")) {
    return {
      provinceId: "8", // Barcelona
      procedureId: "4010", // POLICIA-TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA)
      rawLabel: "Barcelona - Toma de Huellas",
    };
  }

  return null;
}

async function startListener() {
  const client = new TelegramClient(sessionString, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log("MTProto listener connected.");

  // Fetch dialogs once so Teleproto caches entity access hashes
  await client.getDialogs({});

  client.addEventHandler(
    async (event: NewMessageEvent) => {
      const text = event.message.text || "";
      if (!text) return;

      const parsed = parseAlertMessage(text);
      if (!parsed) {
        console.log("Ignored non-matching alert:", text.slice(0, 80));
        return;
      }

      const key = `${parsed.provinceId}:${parsed.procedureId}`;
      const lastRun = recentChecks.get(key) ?? 0;

      if (isChecking || Date.now() - lastRun < COOLDOWN_MS) {
        console.log(
          `Skipping duplicate check for ${parsed.rawLabel} (cooldown / in-progress)`,
        );
        return;
      }

      // Pick first active applicant from SQLite DB
      const applicants = dbService.getActiveApplicants();
      if (applicants.length === 0) {
        console.log(
          "No active applicants found in SQLite DB. Cannot verify alert.",
        );
        return;
      }

      const applicant = applicants[0];
      if (!applicant) return;

      const prov = catalogService.getProvince(parsed.provinceId);
      const proc = catalogService.getProcedure(
        parsed.provinceId,
        parsed.procedureId,
      );

      const targetApplicant: Applicant = {
        ...applicant,
        provinceCode: parsed.provinceId || applicant.provinceCode,
        provinceName: prov?.name || applicant.provinceName,
        provinceUrl: prov?.url || applicant.provinceUrl,
        procedureCode: parsed.procedureId || applicant.procedureCode,
        procedureName: proc?.name || applicant.procedureName,
        procedureGroup: proc?.selectName || applicant.procedureGroup,
      };

      isChecking = true;
      recentChecks.set(key, Date.now());

      try {
        console.log(
          `Alert received for ${parsed.rawLabel}. Verifying live with checkNieSlots for applicant ${applicant.fullName} (${applicant.nie})...`,
        );

        // Check once, no proxy needed. Tab stays open via KEEP_TAB_ON_SLOT=true in env.
        const result = await checkNieSlots(targetApplicant, null);

        dbService.recordApplicantCheck(applicant.id, result.status);

        const isGenuine = result.status === "AVAILABLE";

        console.log(
          `Verification result for ${parsed.rawLabel}: status=${result.status}, genuine=${isGenuine}`,
        );

        // Send notification via dedicated alert bot (uses ALERT_BOT_TOKEN)
        await telegramBot.sendAlertNotification({
          rawLabel: parsed.rawLabel,
          isGenuine,
          result,
          applicant,
        });
      } catch (err) {
        console.error(`Verification failed for ${parsed.rawLabel}:`, err);
        await telegramBot.sendVerificationError({
          rawLabel: parsed.rawLabel,
          error: err,
          chatId: applicant.chatId,
        });
      } finally {
        isChecking = false;
      }
    },
    new NewMessage({
      incoming: true,
      chats: ALERT_SOURCE ? [ALERT_SOURCE] : undefined,
    }),
  );
}

startListener();
