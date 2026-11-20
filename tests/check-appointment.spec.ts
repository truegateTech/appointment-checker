import { type Locator, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { humanClick, humanPause, humanType } from "@/utils/human";
import { requiredEnv } from "@/utils/env";

const NO_SLOTS_MESSAGES = [
  "En este momento no hay citas disponibles.\n\nEn breve, la Oficina pondrá a su disposición nuevas citas.",
  "En este momento no hay citas disponibles para la reserva sin cl@ve.",
  "Información: En este momento",
  "Su sesión ha caducado por permanecer demasiado tiempo inactiva. Deberás iniciar de nuevo la solicitud de la cita previa.",
  "Información: En este momento no hay citas disponibles",
];

// Escape regex characters and convert any whitespace/newlines into \s+
const NO_SLOTS_PATTERN = new RegExp(
  NO_SLOTS_MESSAGES.map((msg) =>
    msg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
  ).join("|"),
  "i",
);

const URL_REJECTED = /The requested URL was rejected/i;
const APPOINTMENT_URL = process.env.APPOINTMENT_URL ?? "http://localhost:3000";

async function assertNotRejected(page: Page): Promise<void> {
  await expect(
    page.locator("body"),
    "The appointment site rejected the request.",
  ).not.toContainText(URL_REJECTED);
}

// test.use({
//   locale: "es-ES",
//   timezoneId: "Europe/Madrid",
//   launchOptions: {
//     headless: false,
//   },
// });

// test.beforeEach(async ({ context }) => {
//   await context.addInitScript(() => {
//     Object.defineProperty(navigator, "webdriver", {
//       get: () => undefined,
//     });
//   });
// });

test("checks for available NIE appointment slots", async ({ page }) => {
  const nie = requiredEnv("NIE");
  const fullName = requiredEnv("FULL_NAME");
  const nationalityCode = requiredEnv("NATIONALITY_CODE");

  await test.step("Open appointment portal and select procedure", async () => {
    await page.goto(APPOINTMENT_URL, { waitUntil: "domcontentloaded" });
    await assertNotRejected(page);
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
    await procedureSelect.selectOption("4010");
    await humanPause(700, 1500);

    await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
    await assertNotRejected(page);
  });

  await test.step("Enter applicant details", async () => {
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
    await humanType(nieInput, nie);
    await humanPause(500, 1100);

    const nameInput = page.getByRole("textbox", {
      name: "*Nombre y apellidos Campo",
    });
    await humanClick(page, nameInput);
    await humanType(nameInput, fullName);
    await humanPause(500, 1200);

    const countrySelect = page.getByLabel("País de nacionalidad");
    await humanClick(page, countrySelect);
    await humanPause(300, 750);
    await countrySelect.selectOption(nationalityCode);
    await humanPause(800, 1700);

    await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
    await humanPause(1100, 2400);

    await humanClick(
      page,
      page.getByRole("button", { name: "Solicitar Cita" }),
    );
  });

  await test.step("Verify appointment slot availability", async () => {
    await humanPause(800, 1600);
    await assertNotRejected(page);
    await expect(
      page.locator("body"),
      "No appointment slots are currently available.",
    ).not.toContainText(NO_SLOTS_PATTERN);
  });
});
