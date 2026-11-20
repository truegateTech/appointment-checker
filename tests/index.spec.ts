import { test, expect } from "@playwright/test";

const TEST_URL = process.env.APPOINTMENT_URL ?? "http://localhost:3000";

test("test", async ({ page }) => {
  await page.goto(TEST_URL);
  await page.locator("body").click();
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustieb/citar?p=8&locale=es");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page
    .getByText(
      "PROVINCIA SELECCIONADA Importante: lee toda la información de esta página,",
    )
    .click();
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4010");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page
    .locator("#btnEntrar")
    .getByRole("paragraph")
    .filter({ hasText: "A continuación puedes acceder" })
    .click();
  await page
    .getByRole("textbox", { name: "* N.I.E. Campo obligatorio" })
    .click();
  await page
    .getByRole("textbox", { name: "* N.I.E. Campo obligatorio" })
    .fill("Z5341259c");
  await page
    .getByRole("textbox", { name: "*Nombre y apellidos Campo" })
    .click();
  await page
    .getByRole("textbox", { name: "*Nombre y apellidos Campo" })
    .press("CapsLock");
  await page
    .getByRole("textbox", { name: "*Nombre y apellidos Campo" })
    .fill("APNINDER PAL");
  await page.getByLabel("País de nacionalidad").selectOption("403");
  await page.getByLabel("País de nacionalidad").selectOption("202");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByRole("button", { name: "Solicitar Cita" }).click();
  await page.getByText("Información: En este momento").click();
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByRole("button", { name: "Aceptar" }).click();
});
