import type { Page } from "playwright";
import { config } from "@/config/env";
import { browserService } from "@/services/browser.service";
import { logger } from "@/services/logger.service";
import type { SlotCheckResult } from "@/types/monitor.types";
import { humanClick, humanPause, humanType } from "@/utils/human";
import { Applicant } from "@/types/applicant.types";

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

export async function checkNieSlots(
  applicant: Applicant,
): Promise<SlotCheckResult> {
  return browserService.withPage<SlotCheckResult>(async (page) => {
    await page.goto(config.appointmentUrl, { waitUntil: "domcontentloaded" });
    if (await isRejected(page)) {
      return { result: rejectedResult(page, "initial load") };
    }
    await humanPause(1200, 2600);

    await humanClick(
      page,
      page.getByText(
        "PROVINCIA SELECCIONADA Importante: lee toda la información de esta página,",
      ),
    );
    await humanPause(600, 1400);

    const procedureSelect = page.getByLabel("TRÁMITES POLICÍA NACIONAL");
    await humanClick(page, procedureSelect);
    await humanPause(300, 700);
    await procedureSelect.selectOption(applicant.procedureCode);
    await humanPause(700, 1500);

    await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
    await page.waitForLoadState("domcontentloaded");
    if (await isRejected(page)) {
      return { result: rejectedResult(page, "procedure selection") };
    }

    await humanPause(1000, 2200);

    await humanClick(
      page,
      page
        .locator("#btnEntrar")
        .getByRole("paragraph")
        .filter({ hasText: "A continuación puedes acceder" }),
    );
    await humanPause(900, 1900);

    const nieInput = page.getByRole("textbox", {
      name: "* N.I.E. Campo obligatorio",
    });
    await humanClick(page, nieInput);
    await humanType(nieInput, applicant.nie);
    await humanPause(500, 1100);

    const nameInput = page.getByRole("textbox", {
      name: "*Nombre y apellidos Campo",
    });
    await humanClick(page, nameInput);
    await humanType(nameInput, applicant.fullName);
    await humanPause(500, 1200);

    const countrySelect = page.getByLabel("País de nacionalidad");
    await humanClick(page, countrySelect);
    await humanPause(300, 750);
    await countrySelect.selectOption(applicant.nationalityCode);
    await humanPause(800, 1700);

    await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
    await humanPause(1100, 2400);

    const solicitarBtn = page.getByRole("button", { name: "Solicitar Cita" });
    await humanClick(page, solicitarBtn);

    await solicitarBtn
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {});
    await page.waitForLoadState("domcontentloaded");
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await humanPause(800, 1600);

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

    const screenshotPath = logger.getScreenshotPath("slot-available");
    await page
      .screenshot({ path: screenshotPath, fullPage: true })
      .catch(() => {});

    return {
      keepTabOpen: config.keepTabOnSlot,
      result: {
        status: "AVAILABLE",
        message: "NIE appointment slots appear to be available!",
        details: `Page title: ${await page.title()}`,
        url: page.url(),
        screenshotPath,
      },
    };
  });
}
