import { test, expect } from "@playwright/test";

test.use({
  locale: "es-ES",
  timezoneId: "Europe/Madrid",
});

test("test", async ({ page }) => {
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=15&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=2&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpco/citar?p=3&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=4&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=1&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=33&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=5&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=6&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustieb/citar?p=8&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=48&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=9&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=10&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=11&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=39&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=12&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=51&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=13&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=14&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=16&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=20&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=17&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=18&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=19&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=21&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=22&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=7&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=23&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=26&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=35&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=24&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=25&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=27&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustiem/citar?p=28&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=29&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=52&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=30&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=31&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=32&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=34&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=36&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=37&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpco/citar?p=38&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=40&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=41&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=42&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=43&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=44&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=45&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=46&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=47&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=49&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=50&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=15&locale=es");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByRole("button", { name: "Volver" }).click();
});

test("test", async ({ page }) => {
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=15&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=2&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpco/citar?p=3&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=4&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=1&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=33&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=5&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=6&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustieb/citar?p=8&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=48&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=9&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=10&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=11&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=39&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=12&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=51&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=13&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=14&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=16&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=20&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=17&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=18&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=19&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=21&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=22&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=7&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=23&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=26&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=35&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=24&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=25&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=27&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustiem/citar?p=28&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustie/citar?p=29&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=52&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=30&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=31&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=32&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=34&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=36&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=37&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpco/citar?p=38&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=40&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=41&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=42&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=43&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=44&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=45&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=46&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=47&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=49&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=50&locale=es");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page.getByLabel("PROVINCIAS DISPONIBLES").press("ArrowDown");
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplus/citar?p=15&locale=es");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByRole("button", { name: "Volver" }).click();
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustieb/citar?p=8&locale=es");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("20");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4118");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4036");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4092");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4067");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4031");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4037");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4038");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4049");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4096");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4079");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4112");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4130");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4131");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4094");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4047");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4010");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").press("ArrowDown");
  await page.getByLabel("Selecciona Oficina:").selectOption("22");
  await page.goto(
    "https://icp.administracionelectronica.gob.es/icpplustieb/selectSede",
  );
  await page
    .getByLabel("PROVINCIAS DISPONIBLES")
    .selectOption("/icpplustieb/citar?p=8&locale=es");
  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByLabel("TRÁMITES POLICÍA NACIONAL").selectOption("4010");
  await page.getByRole("button", { name: "Aceptar" }).click();
});
