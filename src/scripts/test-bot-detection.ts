import "dotenv/config";
import { browserService } from "@/services/browser.service";
import { logger } from "@/services/logger.service";
import { proxyService } from "@/services/proxy.service";

const TEST_SITES = [
  { name: "sannysoft", url: "https://bot.sannysoft.com/", waitMs: 3000 },
  {
    name: "rebrowser",
    url: "https://bot-detector.rebrowser.net/",
    waitMs: 4000,
  },
  {
    name: "browserscan",
    url: "https://www.browserscan.net/bot-detection",
    waitMs: 6000,
  },
  { name: "pixelscan", url: "https://pixelscan.net/bot-check", waitMs: 6000 },
];

async function runAudit(): Promise<void> {
  await proxyService.init();
  await browserService.connect();

  const proxy = proxyService.acquire();
  if (proxy) {
    console.log(`[Audit] Using proxy: ${proxy.label}`);
  }

  await browserService.withPage(
    TEST_SITES[0]!.url,
    async (page) => {
      for (const site of TEST_SITES) {
        console.log(`\n[Audit] Visiting ${site.url} ...`);
        await page.goto(site.url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.waitForTimeout(site.waitMs);

        // Read Rebrowser JSON report directly when available
        if (site.name === "rebrowser") {
          const jsonText = await page
            .locator("#detections-json")
            .textContent()
            .catch(() => null);
          if (jsonText) {
            console.log("[Audit][Rebrowser]:", jsonText.trim());
          }
        }

        const shotPath = logger.getScreenshotPath(`audit-${site.name}`);
        await page.screenshot({ path: shotPath, fullPage: true });
        console.log(`[Audit] Saved screenshot -> ${shotPath}`);
      }

      return { result: true };
    },
    proxy,
  );

  await browserService.disconnect();
}

void runAudit().catch(async (err) => {
  console.error("[Audit] Failed:", err);
  await browserService.disconnect().catch(() => {});
  process.exit(1);
});
