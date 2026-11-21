import type { Locator, Page } from "playwright";
import { config } from "@/config/env";
import { browserService } from "@/services/browser.service";
import { logger } from "@/services/logger.service";
import type { Applicant } from "@/types/applicant.types";
import type { SlotCheckResult } from "@/types/monitor.types";
import { humanClick, humanPause, humanType } from "@/utils/human";
import { randomInt } from "node:crypto";
import { SelectedProxy } from "@/services/proxy.service";

const NO_SLOTS_MESSAGES = [
  "En este momento no hay citas disponibles.\n\nEn breve, la Oficina pondrá a su disposición nuevas citas.",
  "En este momento no hay citas disponibles para la reserva sin cl@ve.",
  "Información: En este momento",
  "Información: En este momento no hay citas disponibles",
];

const SESSION_EXPIRED_MESSAGES = [
  "Su sesión ha caducado por permanecer demasiado tiempo inactiva. Deberás iniciar de nuevo la solicitud de la cita previa.",
];

function buildPattern(messages: string[]): RegExp {
  return new RegExp(
    messages
      .map((msg) =>
        msg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
      )
      .join("|"),
    "i",
  );
}

const NO_SLOTS_PATTERN = buildPattern(NO_SLOTS_MESSAGES);
const SESSION_EXPIRED_PATTERN = buildPattern(SESSION_EXPIRED_MESSAGES);
const URL_REJECTED_PATTERN = /The requested URL was rejected/i;
const POSITIVE_SLOT_TEXT =
  /Seleccione una de las siguientes citas disponibles/i;
const OFFICE_HEADING_TEXT = /Seleccione la oficina donde solicitar la cita/i;

type PositiveDetectionResult =
  | { matched: true; stage: string; details: string }
  | { matched: false };

async function getBodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).trim();
}

async function isRejected(page: Page): Promise<boolean> {
  const text = await getBodyText(page);
  return URL_REJECTED_PATTERN.test(text);
}

function rejectedResult(page: Page, step: string): SlotCheckResult {
  return {
    status: "REJECTED",
    message: `Request rejected by WAF during "${step}"`,
    url: page.url(),
  };
}

async function selectRandomOption(
  page: Page,
  locator: Locator,
): Promise<string | null> {
  if (!(await locator.isVisible().catch(() => false))) {
    return null;
  }

  const validOptions = await locator.locator("option").evaluateAll((opts) =>
    opts
      .map((opt) => {
        const el = opt as HTMLOptionElement;
        return {
          value: el.value.trim(),
          label: (el.textContent ?? "").trim(),
          disabled: el.disabled,
        };
      })
      .filter(
        (o) =>
          !o.disabled &&
          o.value !== "" &&
          o.value !== "-1" &&
          o.value !== "0" &&
          !/^(seleccione|elija|choose)/i.test(o.label),
      ),
  );

  if (validOptions.length === 0) return null;

  const picked = validOptions[randomInt(0, validOptions.length - 1)];
  if (!picked) return null;

  await humanClick(page, locator);
  await humanPause(300, 750);
  await locator.selectOption(picked.value);
  return `${picked.label} (${picked.value})`;
}
async function findProcedureSelect(
  page: Page,
  procedureCode: string,
): Promise<Locator> {
  // Match whichever visible <select> holds this procedure code (works for tramiteGrupo[0] or [1])
  const byOption = page
    .locator(`select:has(option[value="${procedureCode}"])`)
    .first();

  try {
    await byOption.waitFor({ state: "visible", timeout: 15_000 });
    return byOption;
  } catch {
    const byLabel = page.getByLabel("TRÁMITES POLICÍA NACIONAL");
    if (await byLabel.isVisible().catch(() => false)) {
      return byLabel;
    }

    const foundSelects = await page.locator("select").evaluateAll((els) =>
      els.map((el) => {
        const s = el as HTMLSelectElement;
        return `${s.name || s.id || "(unnamed)"}[${s.options.length}]`;
      }),
    );

    throw new Error(
      `Procedure "${procedureCode}" not found on ${page.url()}. Selects on page: ${
        foundSelects.join(", ") || "none"
      }`,
    );
  }
}

async function detectAvailableSlot(
  page: Page,
  bodyText: string,
): Promise<PositiveDetectionResult> {
  // Never treat as available if a known no-slots message is on screen
  if (NO_SLOTS_PATTERN.test(bodyText)) {
    return { matched: false };
  }

  // 1. Direct appointment slot picker screen
  if (POSITIVE_SLOT_TEXT.test(bodyText)) {
    return {
      matched: true,
      stage: "SLOT_PICKER",
      details: 'Matched "Seleccione una de las siguientes citas disponibles"',
    };
  }

  // 2. Office selection screen: require an actual visible #idSede dropdown with real options
  const officeSelect = page.locator("select#idSede");
  if (await officeSelect.isVisible().catch(() => false)) {
    const offices = await officeSelect.locator("option").evaluateAll((opts) =>
      opts
        .map((o) => {
          const el = o as HTMLOptionElement;
          return {
            value: el.value.trim(),
            label: (el.textContent ?? "").trim(),
          };
        })
        .filter((o) => o.value !== "" && o.value !== "-1" && o.value !== "0"),
    );

    if (offices.length > 0 && OFFICE_HEADING_TEXT.test(bodyText)) {
      const preview = offices
        .slice(0, 3)
        .map((o) => o.label)
        .join(", ");
      return {
        matched: true,
        stage: "OFFICE_SELECT",
        details: `Offices available (${offices.length}): ${preview}`,
      };
    }
  }

  // 3. Contact details screen (reached directly when only one office is open)
  const phoneInput = page.locator("#txtTelefonoCitado");
  const emailInput = page.locator("#emailUNO");
  const hasContactForm =
    (await phoneInput.isVisible().catch(() => false)) ||
    (await emailInput.isVisible().catch(() => false));

  if (hasContactForm) {
    return {
      matched: true,
      stage: "CONTACT_DETAILS",
      details: "Reached contact details form (#txtTelefonoCitado / #emailUNO)",
    };
  }

  return { matched: false };
}

export async function checkNieSlots(
  applicant: Applicant,
  proxy?: SelectedProxy | null,
): Promise<SlotCheckResult> {
  const targetUrl = applicant.provinceUrl || config.appointmentUrl;

  return browserService.withPage<SlotCheckResult>(
    targetUrl,
    async (page) => {
      // Step 1: Reload or navigate the single tab to the province page
      if (page.url() === targetUrl) {
        await page.reload({ waitUntil: "domcontentloaded" });
      } else {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      }

      if (await isRejected(page)) {
        return { result: rejectedResult(page, "initial load") };
      }
      await humanPause(1200, 2600);

      const provinceHeader = page.getByText(
        "PROVINCIA SELECCIONADA Importante: lee toda la información de esta página,",
      );
      if (await provinceHeader.isVisible().catch(() => false)) {
        await humanClick(page, provinceHeader);
        await humanPause(600, 1400);
      }

      // Step 2: Locate and select the procedure dynamically
      const procedureSelect = await findProcedureSelect(
        page,
        applicant.procedureCode,
      );
      await humanClick(page, procedureSelect);
      await humanPause(300, 700);
      await procedureSelect.selectOption(applicant.procedureCode);
      await humanPause(700, 1500);

      await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
      await page.waitForLoadState("domcontentloaded");
      if (await isRejected(page)) {
        return { result: rejectedResult(page, "procedure selection") };
      }

      // Step 3: Enter applicant details
      await humanPause(1000, 2200);

      const enterButton = page.locator("#btnEntrar");
      await enterButton.waitFor({ state: "visible", timeout: 20_000 });
      await humanClick(page, enterButton);
      await page.waitForLoadState("domcontentloaded");
      await humanPause(900, 1900);

      const nieInput = page.getByRole("textbox", {
        name: "* N.I.E. Campo obligatorio",
      });
      await nieInput.waitFor({ state: "visible", timeout: 20_000 });
      await humanClick(page, nieInput);
      await humanType(nieInput, applicant.nie);
      await humanPause(500, 1100);

      const nameInput = page.getByRole("textbox", {
        name: "*Nombre y apellidos Campo",
      });
      await humanClick(page, nameInput);
      await humanType(nameInput, applicant.fullName);
      await humanPause(700, 1500);

      // Select a random valid option for the required País de nacionalidad dropdown (#txtPaisNac)
      const pickedCountry = await selectRandomOption(
        page,
        page.locator("#txtPaisNac"),
      );

      if (pickedCountry) {
        console.log(`Selected random country/state option: ${pickedCountry}`);
        await humanPause(500, 1100);
      }

      await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
      await page.waitForLoadState("domcontentloaded");
      await humanPause(1100, 2400);

      const solicitarBtn = page.getByRole("button", { name: "Solicitar Cita" });
      await solicitarBtn.waitFor({ state: "visible", timeout: 20_000 });
      await humanClick(page, solicitarBtn);

      await solicitarBtn
        .waitFor({ state: "hidden", timeout: 20_000 })
        .catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});
      await humanPause(800, 1600);

      // Step 4: Verify slot availability (strict positive check only)
      const bodyText = await getBodyText(page);

      if (URL_REJECTED_PATTERN.test(bodyText)) {
        return { result: rejectedResult(page, "slot verification") };
      }

      if (SESSION_EXPIRED_PATTERN.test(bodyText)) {
        return {
          result: {
            status: "SESSION_EXPIRED",
            message: "Portal session expired before completing check",
            url: page.url(),
          },
        };
      }

      if (NO_SLOTS_PATTERN.test(bodyText)) {
        return {
          result: {
            status: "NO_SLOTS",
            message: "No appointment slots are currently available",
            url: page.url(),
          },
        };
      }

      const positive = await detectAvailableSlot(page, bodyText);
      if (positive.matched) {
        const screenshotPath = logger.getScreenshotPath("slot-available");
        await page
          .screenshot({ path: screenshotPath, fullPage: true })
          .catch(() => {});

        return {
          keepTabOpen: config.keepTabOnSlot,
          result: {
            status: "AVAILABLE",
            message: `NIE appointment slots AVAILABLE (${positive.stage})!`,
            details: positive.details,
            url: page.url(),
            screenshotPath,
          },
        };
      }

      // Unrecognized portal screen (maintenance, unexpected error, CAPTCHA, etc.)
      const snippet = bodyText.replace(/\s+/g, " ").slice(0, 220);
      const screenshotPath = logger.getScreenshotPath("unknown");
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => {});

      return {
        result: {
          status: "UNKNOWN",
          message:
            "Unrecognized response page (no positive slot indicator found)",
          details: `Snippet: ${snippet}`,
          url: page.url(),
          screenshotPath,
        },
      };
    },
    proxy,
  );
}
