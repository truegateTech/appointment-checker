// src/listener.ts
import "dotenv/config";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { NewMessage, NewMessageEvent } from "teleproto/events";
import { verifySlotAvailability } from "./verifier";

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
  if (normalized.includes("barcelona") && normalized.includes("huellas")) {
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
        console.log(`Skipping duplicate check for ${parsed.rawLabel}`);
        return;
      }

      isChecking = true;
      recentChecks.set(key, Date.now());

      try {
        console.log(`Alert received for ${parsed.rawLabel}. Verifying live...`);
        const result = await verifySlotAvailability(parsed);

        if (result.available) {
          // Send confirmed alert to your own Saved Messages ("me") or via a Bot API webhook
          await client.sendMessage("me", {
            message: `CONFIRMED LIVE: ${parsed.rawLabel}\nVerified at: ${new Date().toISOString()}`,
            file: result.screenshotPath,
          });
        } else {
          console.log(
            `False alarm / already gone for ${parsed.rawLabel}: ${result.reason}`,
          );
        }
      } catch (err) {
        console.error("Verification failed:", err);
      } finally {
        isChecking = false;
      }
    },
    new NewMessage({
      incoming: true,
      chats: [ALERT_SOURCE],
    }),
  );
}

startListener();
