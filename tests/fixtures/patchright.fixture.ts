import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
  type Browser,
} from "@playwright/test";
import { chromium, type LaunchOptions } from "patchright";
import {
  STEALTH_LAUNCH_ARGS,
  applyStealthToContext,
  getStealthContextOptions,
} from "@/utils/stealth";

export interface BotTestFixtures {
  botPage: Page;
  botContext: BrowserContext;
}

const TEST_LOCALE = "en-US";
const TEST_TIMEZONE = "America/New_York";

export const test = base.extend<BotTestFixtures, { botBrowser: Browser }>({
  // Worker-scoped browser instance using patchright (CDP & driver evasion patches)
  //
  // Patchright already handles these internally — do NOT pass them manually:
  //   --no-sandbox                              → added by default (chromiumSandbox !== true)
  //   --disable-blink-features=AutomationControlled → auto-injected for chromium
  //   --enable-automation                       → auto-removed via ignoreDefaultArgs
  //   navigator.webdriver = false               → patched at driver/CDP level
  //   Runtime.enable / Console.enable leaks     → suppressed at protocol level
  //
  // Additional stealth args are imported from src/utils/stealth.ts so both
  // production (browser.service.ts) and tests share the same hardening.
  botBrowser: [
    async ({}, use) => {
      const launchOptions: LaunchOptions = {
        headless: process.env.HEADLESS !== "false",
        args: [...STEALTH_LAUNCH_ARGS, "--start-maximized"],
      };

      const browser = await chromium.launch(launchOptions);
      await use(browser as unknown as Browser);
      await browser.close();
    },
    { scope: "worker" },
  ],

  // Test-scoped isolated context with realistic browser attributes
  // Uses the same stealth context options as production for consistency.
  botContext: async ({ botBrowser }, use) => {
    const stealthOpts = getStealthContextOptions({
      locale: TEST_LOCALE,
      timezoneId: TEST_TIMEZONE,
      geolocation: { latitude: 40.7128, longitude: -74.006 },
    });

    const context = await (botBrowser as any).newContext({
      ...stealthOpts,
      javaScriptEnabled: true,
      // Let patchright's patched Chromium set its own UA + client-hint headers.
      // A hardcoded UA string will drift out of date and mismatch the actual
      // browser version, which sophisticated detectors (CreepJS, BrowserScan)
      // flag as "inconsistent".
    });

    // Apply navigator patches, canvas noise, and header normalization
    await applyStealthToContext(context, {
      locale: TEST_LOCALE,
      timezoneId: TEST_TIMEZONE,
    });

    await use(context);
    await context.close();
  },

  // Test-scoped page
  botPage: async ({ botContext }, use) => {
    const page = await botContext.newPage();
    // Default navigation timeout for bot detection audits
    page.setDefaultTimeout(45_000);
    page.setDefaultNavigationTimeout(45_000);
    await use(page);
    await page.close();
  },
});

export { expect };
