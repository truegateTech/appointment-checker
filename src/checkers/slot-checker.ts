import type { Locator, Page, Response as PlaywrightResponse } from "patchright";
import { config } from "@/config/env";
import { browserService } from "@/services/browser.service";
import { logger } from "@/services/logger.service";
import type { SelectedProxy } from "@/services/proxy.service";
import type { Applicant } from "@/types/applicant.types";
import type { SlotCheckResult } from "@/types/monitor.types";

const NO_SLOTS_MESSAGES = [
  "En este momento no hay citas disponibles.\n\nEn breve, la Oficina pondrá a su disposición nuevas citas.",
  "En este momento no hay citas disponibles para la reserva sin cl@ve.",
  "En este momento no hay citas disponibles",
];

const SESSION_EXPIRED_MESSAGES = [
  "Su sesión ha caducado por permanecer demasiado tiempo inactiva. Deberás iniciar de nuevo la solicitud de la cita previa.",
  "Su sesión ha caducado",
  "La sesión ha expirado",
];

const ACCESS_BLOCKED_PATTERNS: RegExp[] = [
  /The requested URL was rejected/i,
  /please consult with your administrator/i,
  /contact (?:your|the|an?) (?:system )?administrator/i,
  /your support ID is/i,
  /access (?:denied|blocked|forbidden)/i,
  /request (?:was )?blocked/i,
  /you don['’]t have permission to access/i,
  /too many requests/i,
  /acceso denegado/i,
  /acceso bloqueado/i,
  /petici[oó]n (?:rechazada|bloqueada)/i,
  /demasiadas (?:peticiones|solicitudes)/i,
  /ha superado el n[uú]mero m[aá]ximo/i,
  /contacte con el administrador/i,
  /p[oó]ngase en contacto con el administrador/i,
  /\b403\s+forbidden\b/i,
  /\b429\s+too many requests\b/i,
];

const PORTAL_ERROR_PATTERNS: RegExp[] = [
  /se ha producido un error/i,
  /error interno del servidor/i,
  /el servicio no est[aá] disponible/i,
  /temporalmente fuera de servicio/i,
  /en mantenimiento/i,
  /no se puede procesar su solicitud/i,
  /service (?:temporarily )?unavailable/i,
  /internal server error/i,
  /bad gateway/i,
  /gateway time-?out/i,
  /\b50[0234]\b.*(?:error|unavailable|gateway|timeout)/i,
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
const POSITIVE_SLOT_TEXT =
  /Seleccione una de las siguientes citas disponibles/i;
const OFFICE_HEADING_TEXT = /Seleccione la oficina donde solicitar la cita/i;

type PositiveDetectionResult =
  | { matched: true; stage: string; details: string }
  | { matched: false };

async function getBodyText(page: Page): Promise<string> {
  return (
    await page
      .locator("body")
      .innerText()
      .catch(() => "")
  ).trim();
}

function summarizeText(text: string, maxLen = 220): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}
async function captureScreenshot(
  page: Page,
  prefix: string,
): Promise<string | undefined> {
  if (page.isClosed()) return undefined;
  const screenshotPath = logger.getScreenshotPath(prefix);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

async function detectWebsiteError(
  page: Page,
  step: string,
  response?: PlaywrightResponse | null,
  preloadedBodyText?: string,
): Promise<SlotCheckResult | null> {
  const httpStatus = response?.status() ?? null;
  const bodyText = preloadedBodyText ?? (await getBodyText(page));
  const title = (await page.title().catch(() => "")).trim();
  const combinedText = `${title}\n${bodyText}`;

  // 1. Check HTTP 4xx / 5xx responses immediately
  if (httpStatus !== null && httpStatus >= 400) {
    const snippet = summarizeText(bodyText || title);
    return {
      status: "REJECTED",
      message: `HTTP ${httpStatus} error during "${step}"`,
      details: snippet ? `Snippet: ${snippet}` : undefined,
      url: page.url(),
      screenshotPath: await captureScreenshot(page, `http-${httpStatus}`),
    };
  }

  // 2. Check known WAF / access-blocked / contact-admin messages
  const blockedMatch = ACCESS_BLOCKED_PATTERNS.find((rx) =>
    rx.test(combinedText),
  );
  if (blockedMatch) {
    return {
      status: "REJECTED",
      message: `Access blocked / rejected during "${step}" (${blockedMatch.source})`,
      details: `Snippet: ${summarizeText(bodyText || title)}`,
      url: page.url(),
      screenshotPath: await captureScreenshot(page, "rejected"),
    };
  }

  // 3. Check general server/portal errors
  const portalErrMatch = PORTAL_ERROR_PATTERNS.find((rx) =>
    rx.test(combinedText),
  );
  if (portalErrMatch) {
    return {
      status: "REJECTED",
      message: `Portal error page during "${step}" (${portalErrMatch.source})`,
      details: `Snippet: ${summarizeText(bodyText || title)}`,
      url: page.url(),
      screenshotPath: await captureScreenshot(page, "portal-error"),
    };
  }

  // 4. Check explicit visible portal error alert boxes
  const errorBox = page
    .locator('.mf-msg__error, .error-msg, [role="alert"].error')
    .first();
  if (await errorBox.isVisible().catch(() => false)) {
    const errText = summarizeText(await errorBox.innerText().catch(() => ""));
    if (errText) {
      return {
        status: "REJECTED",
        message: `Portal error alert during "${step}"`,
        details: errText,
        url: page.url(),
        screenshotPath: await captureScreenshot(page, "portal-alert"),
      };
    }
  }

  return null;
}

const PAGE_TITLE_INFO_PATTERN = /\binformaci[oó]n\b/i;
const STEP_INDICATOR_PATTERN = /Paso\s+\d+\s+de\s+\d+/i;
const USER_IDENTITY_PATTERN = /Identidad\s+del\s+usuario\s+de\s+cita/i;
const COD_OPER_PATTERN = /C[oó]d\.?\s*Oper\.?\s*:?\s*([^\r\n]{3,80})?/i;

interface IpBlockDetectionResult {
  blocked: boolean;
  reason?: string;
}

async function detectDailyIpBlock(
  page: Page,
  bodyText: string,
  applicant: Applicant,
): Promise<IpBlockDetectionResult> {
  const pageTitle = (await page.title().catch(() => "")).trim();
  const normalizedNie = applicant.nie.trim().toUpperCase();

  // 1. Genuine processed search markers — if any are present, the portal DID process the search
  const hasStepIndicator = STEP_INDICATOR_PATTERN.test(bodyText);
  const hasIdentitySection = USER_IDENTITY_PATTERN.test(bodyText);
  const hasEchoedNie =
    normalizedNie.length > 0 && bodyText.toUpperCase().includes(normalizedNie);
  const hasSalirButton = await page
    .getByRole("button", { name: /^Salir$/i })
    .first()
    .isVisible()
    .catch(() => false);

  if (
    hasStepIndicator ||
    hasIdentitySection ||
    hasEchoedNie ||
    hasSalirButton
  ) {
    return { blocked: false };
  }

  // 2. Blocked screen markers — <title> "Información", "Cod. Oper.", single "Aceptar" button
  const hasInfoTitle = PAGE_TITLE_INFO_PATTERN.test(pageTitle);
  const codOperMatch = bodyText.match(COD_OPER_PATTERN);
  const hasCodOper = codOperMatch !== null;
  const hasAceptarButton = await page
    .getByRole("button", { name: /^Aceptar$/i })
    .first()
    .isVisible()
    .catch(() => false);

  const isBlocked =
    (hasInfoTitle && (hasCodOper || hasAceptarButton)) ||
    (hasCodOper && hasAceptarButton);

  if (!isBlocked) {
    return { blocked: false };
  }

  const codOperValue = codOperMatch?.[1]?.trim();
  const parts = [
    `title="${pageTitle || "(empty)"}"`,
    codOperValue
      ? `Cod. Oper.=${codOperValue}`
      : hasCodOper
        ? "Cod. Oper. present"
        : null,
    hasAceptarButton ? 'button="Aceptar"' : null,
  ].filter((part): part is string => part !== null);

  return {
    blocked: true,
    reason: parts.join(", "),
  };
}
async function findProcedureSelect(
  page: Page,
  procedureCode: string,
): Promise<Locator> {
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

async function selectRandomOption(locator: Locator): Promise<string | null> {
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

  const picked = validOptions[Math.floor(Math.random() * validOptions.length)];
  if (!picked) return null;

  await locator.selectOption(picked.value);
  return `${picked.label} (${picked.value})`;
}

async function detectAvailableSlot(
  page: Page,
  bodyText: string,
): Promise<PositiveDetectionResult> {
  if (NO_SLOTS_PATTERN.test(bodyText)) {
    return { matched: false };
  }

  if (POSITIVE_SLOT_TEXT.test(bodyText)) {
    return {
      matched: true,
      stage: "SLOT_PICKER",
      details: 'Matched "Seleccione una de las siguientes citas disponibles"',
    };
  }

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
      // Step 1: Load province page
      const initialResponse =
        page.url() === targetUrl
          ? await page.reload({ waitUntil: "domcontentloaded" })
          : await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      const loadError = await detectWebsiteError(
        page,
        "initial load",
        initialResponse,
      );
      if (loadError) {
        return { result: loadError };
      }

      // Step 2: Select procedure and submit
      const procedureSelect = await findProcedureSelect(
        page,
        applicant.procedureCode,
      );
      await procedureSelect.selectOption(applicant.procedureCode);
      await page.getByRole("button", { name: "Aceptar" }).click();
      await page.waitForLoadState("domcontentloaded");

      const procError = await detectWebsiteError(page, "procedure selection");
      if (procError) {
        return { result: procError };
      }

      // Step 3: Enter applicant details
      await page.locator("#btnEntrar").click();
      await page.waitForLoadState("domcontentloaded");

      const enterError = await detectWebsiteError(page, "enter form");
      if (enterError) {
        return { result: enterError };
      }

      await page
        .getByRole("textbox", { name: "* N.I.E. Campo obligatorio" })
        .fill(applicant.nie);

      await page
        .getByRole("textbox", { name: "*Nombre y apellidos Campo" })
        .fill(applicant.fullName);

      const pickedCountry = await selectRandomOption(
        page.locator("#txtPaisNac"),
      );
      if (pickedCountry) {
        console.log(`[Form] Selected #txtPaisNac option: ${pickedCountry}`);
      }

      await page.getByRole("button", { name: "Aceptar" }).click();
      await page.waitForLoadState("domcontentloaded");

      const detailsError = await detectWebsiteError(page, "applicant details");
      if (detailsError) {
        return { result: detailsError };
      }

      const solicitarBtn = page.getByRole("button", { name: "Solicitar Cita" });
      await solicitarBtn.click();

      await solicitarBtn
        .waitFor({ state: "hidden", timeout: 20_000 })
        .catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});

      // Step 4: Verify final screen
      const bodyText = await getBodyText(page);

      const finalError = await detectWebsiteError(
        page,
        "slot verification",
        null,
        bodyText,
      );
      if (finalError) {
        return { result: finalError };
      }

      if (SESSION_EXPIRED_PATTERN.test(bodyText)) {
        return {
          result: {
            status: "SESSION_EXPIRED",
            message: "Portal session expired before completing check",
            url: page.url(),
            screenshotPath: await captureScreenshot(page, "session-expired"),
          },
        };
      }

      const ipBlock = await detectDailyIpBlock(page, bodyText, applicant);
      if (ipBlock.blocked) {
        return {
          result: {
            status: "IP_BLOCKED",
            message: `IP blocked for 24h (${ipBlock.reason})`,
            details: `Snippet: ${summarizeText(bodyText)}`,
            url: page.url(),
            screenshotPath: await captureScreenshot(page, "ip-blocked"),
          },
        };
      }

      if (NO_SLOTS_PATTERN.test(bodyText)) {
        return {
          result: {
            status: "NO_SLOTS",
            message: "No appointment slots are currently available",
            url: page.url(),
            screenshotPath: await captureScreenshot(page, "no-slots"),
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

      const screenshotPath = logger.getScreenshotPath("unknown");
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => {});

      return {
        result: {
          status: "UNKNOWN",
          message:
            "Unrecognized response page (no positive slot indicator found)",
          details: `Snippet: ${summarizeText(bodyText)}`,
          url: page.url(),
          screenshotPath,
        },
      };
    },
    proxy,
  );
}
