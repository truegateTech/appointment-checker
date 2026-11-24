// src/verifier.ts
import { chromium } from "patchright";

export interface VerificationResult {
  available: boolean;
  reason?: string;
  screenshotPath?: string;
}

const NO_SLOTS_REGEX =
  /en este momento no hay citas disponibles|no hay citas disponibles/i;

export async function verifySlotAvailability(alert: {
  provinceId: string;
  officeId?: string;
  procedureId: string;
}): Promise<VerificationResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "es-ES" });
  const page = await context.newPage();

  try {
    await page.goto(
      "https://icp.administracionelectronica.gob.es/icpplus/index.html",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );

    // 1. Select province and wait for URL transition + next dropdown
    await page
      .locator("#form")
      .selectOption(`/icpplus/citar?p=${alert.provinceId}&locale=es`);
    await page.locator("#btnAceptar").click();
    await page.waitForURL(/\/icpplus\/citar/i, { timeout: 30_000 });

    const procedureSelect = page.locator("select[name='tramiteGrupo[0]']");
    await procedureSelect.waitFor({ state: "visible", timeout: 15_000 });

    // 2. Select office (optional) & procedure, then click Accept
    if (alert.officeId) {
      await page.locator("#sede").selectOption(alert.officeId);
    }
    await procedureSelect.selectOption(alert.procedureId);

    const prevUrl = page.url();
    await page.locator("#btnAceptar").click();

    // Wait for either the URL to change OR the next step's "Entrar" button / block notice to render
    await Promise.race([
      page.waitForURL((url) => url.href !== prevUrl, { timeout: 30_000 }),
      page
        .locator("#btnEntrar")
        .or(page.getByText(/Cod\.\s*Oper\.|bloqueado|too many requests/i))
        .waitFor({ state: "visible", timeout: 30_000 }),
    ]);

    // 3. Wait for the page body to settle before reading content
    await page.waitForLoadState("domcontentloaded");

    // (Continue with #btnEntrar -> applicant details -> #btnEnviar using the same locator.waitFor() pattern)

    const bodyText = (await page.locator("body").textContent()) ?? "";

    if (
      /Cod\.\s*Oper\.|too many requests|demasiadas solicitudes|bloqueado/i.test(
        bodyText,
      )
    ) {
      return {
        available: false,
        reason: "Rate-limited or IP-blocked by portal",
      };
    }

    if (NO_SLOTS_REGEX.test(bodyText)) {
      return { available: false, reason: "No slots available" };
    }

    const screenshotPath = `./logs/screenshots/confirmed-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { available: true, screenshotPath };
  } finally {
    await browser.close();
  }
}
