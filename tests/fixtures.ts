import { test as base, expect, chromium } from "@playwright/test";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9222";

const test = base.extend({
  browser: [
    async ({}, use) => {
      const browser = await chromium.connectOverCDP(CDP_URL);
      await use(browser);
      // Disconnects Playwright cleanly without closing your Chrome window
      await browser.close();
    },
    { scope: "worker" },
  ],

  // Attach to the active profile context instead of creating an isolated incognito context
  context: async ({ browser }, use) => {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await use(context);
  },
});

export { expect, test };
