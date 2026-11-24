// scripts/generate-session.ts
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH!;

async function main() {
  const rl = createInterface({ input, output });
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () =>
        (await rl.question("Phone number (with country code): ")).trim(),
      password: async () =>
        (await rl.question("2FA password (leave blank if none): ")).trim(),
      phoneCode: async () => (await rl.question("Telegram OTP code: ")).trim(),
      onError: (err) => console.error(err),
    });

    console.log("\nSave this in your .env as TG_SESSION_STRING:\n");
    console.log(client.session.save());
  } finally {
    rl.close();
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
