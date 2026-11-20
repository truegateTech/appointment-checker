import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import { chromium } from "playwright";
import type {
  CountryOption,
  PortalCatalog,
  ProcedureOption,
  ProvinceOption,
} from "@/types/catalog.types";
import { humanClick, humanPause } from "@/utils/human";

const BASE_URL = process.env.BASE_URL;
const INDEX_URL = `${BASE_URL}/icpplus/index.html`;
const CDP_URL = process.env.CDP_URL?.trim() || "http://127.0.0.1:9222";
const CATALOG_PATH = path.resolve("data/catalog.json");

function parseRequestedProvinces(): string[] {
  const arg = process.argv.find((a) => a.startsWith("--provinces="));
  if (!arg) return ["Barcelona", "Madrid"];
  return arg
    .replace("--provinces=", "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const wanted = parseRequestedProvinces();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(INDEX_URL, { waitUntil: "domcontentloaded" });
    await humanPause(1000, 1800);

    // 1. Extract all provinces and their direct URLs from the homepage <select>
    const rawProvinces = await page
      .locator("select#form option")
      .evaluateAll((options) =>
        options
          .map((opt) => {
            const el = opt as HTMLOptionElement;
            const value = el.value.trim();
            const name = el.textContent?.trim() ?? "";
            if (!value || value === "default") return null;
            const url = new URL(value, BASE_URL).toString();
            const code = new URL(url).searchParams.get("p") ?? value;
            return { code, name, url };
          })
          .filter(
            (x): x is { code: string; name: string; url: string } => x !== null,
          ),
      );

    const targetProvinces =
      wanted[0] === "all"
        ? rawProvinces
        : rawProvinces.filter((p) =>
            wanted.some((w) => p.name.toLowerCase().includes(w)),
          );

    const provinces: ProvinceOption[] = [];
    let countries: CountryOption[] = [];

    // 2. Visit each selected province URL and dump its procedure dropdowns
    for (const prov of targetProvinces) {
      console.log(`Syncing procedures for ${prov.name} (${prov.url})...`);
      await page.goto(prov.url, { waitUntil: "domcontentloaded" });
      await humanPause(1500, 2800);

      const procedures = await page
        .locator('select[name^="tramiteGrupo"]')
        .evaluateAll((selects) => {
          const items: ProcedureOption[] = [];
          for (const sel of selects) {
            const selectEl = sel as HTMLSelectElement;
            const selectName = selectEl.name;
            for (const opt of Array.from(selectEl.options)) {
              const code = opt.value.trim();
              const name = opt.textContent?.trim() ?? "";
              if (
                !code ||
                code === "-1" ||
                name.toLowerCase().startsWith("despliega")
              ) {
                continue;
              }
              items.push({ code, name, selectName });
            }
          }
          return items;
        });

      provinces.push({ ...prov, procedures });

      // 3. Extract the global nationality dropdown once (step 2 of any procedure)
      if (countries.length === 0 && procedures.length > 0) {
        const sample = procedures[0];
        await page
          .locator(`select[name="${sample.selectName}"]`)
          .selectOption(sample.code);
        await humanPause(600, 1100);
        await humanClick(page, page.getByRole("button", { name: "Aceptar" }));
        await page.waitForLoadState("domcontentloaded");
        await humanPause(1000, 1800);

        const enterBtn = page.locator("#btnEntrar");
        if (await enterBtn.isVisible().catch(() => false)) {
          await humanClick(page, enterBtn);
          await page.waitForLoadState("domcontentloaded");
          await humanPause(1000, 1800);
        }

        const countrySelect = page.getByLabel("País de nacionalidad");
        if (await countrySelect.isVisible().catch(() => false)) {
          countries = await countrySelect
            .locator("option")
            .evaluateAll((opts) =>
              opts
                .map((opt) => {
                  const el = opt as HTMLOptionElement;
                  const code = el.value.trim();
                  const name = el.textContent?.trim() ?? "";
                  if (!code || code === "-1") return null;
                  return { code, name };
                })
                .filter((x): x is CountryOption => x !== null),
            );
          console.log(`Extracted ${countries.length} nationalities.`);
        }
      }
    }

    fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
    const catalog: PortalCatalog = {
      updatedAt: new Date().toISOString(),
      provinces,
      countries,
    };
    fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), "utf8");
    console.log(`Saved catalog to ${CATALOG_PATH}`);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Catalog sync failed:", err);
  process.exit(1);
});
