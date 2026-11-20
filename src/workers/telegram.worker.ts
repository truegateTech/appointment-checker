import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "@/config/env";
import { dbService } from "@/services/db.service";
import { telegram } from "@/services/telegram.service";
import type { TelegramUpdate } from "@/types/telegram.types";
import { telegramBot } from "@/services/telegram-bot.service";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB safety cap

function isValidSecret(headerValue: string | string[] | undefined): boolean {
  if (!config.webhookSecret) return true;
  if (typeof headerValue !== "string") return false;

  const expected = Buffer.from(config.webhookSecret, "utf8");
  const received = Buffer.from(headerValue, "utf8");
  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "telegram-webhook-worker" });
    return;
  }

  if (req.method !== "POST" || url.pathname !== config.webhookPath) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  if (!isValidSecret(req.headers["x-telegram-bot-api-secret-token"])) {
    sendJson(res, 401, { ok: false, error: "Invalid webhook secret" });
    return;
  }

  void readJsonBody(req)
    .then((payload) => {
      // Acknowledge immediately so Telegram never retries slow handlers
      sendJson(res, 200, { ok: true });

      const update = payload as TelegramUpdate;
      void telegramBot.handleUpdate(update).catch((err: unknown) => {
        console.error("Failed to process Telegram update:", err);
      });
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Bad request";
      sendJson(res, 400, { ok: false, error: msg });
    });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Telegram Worker] Received ${signal}. Closing server...`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  dbService.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function main(): Promise<void> {
  await new Promise<void>((resolve) => {
    server.listen(config.webhookPort, () => resolve());
  });

  console.log(
    `[Telegram Worker] Listening on http://127.0.0.1:${config.webhookPort}${config.webhookPath}`,
  );

  if (config.webhookUrl) {
    const fullWebhookUrl = `${config.webhookUrl}${config.webhookPath}`;
    await telegram.setWebhook(fullWebhookUrl, config.webhookSecret);
    console.log(`[Telegram Worker] Webhook registered: ${fullWebhookUrl}`);
  } else {
    console.warn(
      "[Telegram Worker] TELEGRAM_WEBHOOK_URL not set — server is running locally, register webhook manually once tunnel/HTTPS URL is ready.",
    );
  }
}

main().catch((err: unknown) => {
  console.error("[Telegram Worker] Fatal startup error:", err);
  process.exit(1);
});
