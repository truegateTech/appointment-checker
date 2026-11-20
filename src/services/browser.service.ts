import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { config } from "@/config/env";
import { logger } from "@/services/logger.service";

export interface PageError extends Error {
  screenshotPath?: string;
}

class BrowserService {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async connect(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    this.browser = await chromium.connectOverCDP(config.cdpUrl);
    this.browser.on("disconnected", () => {
      this.browser = null;
      this.page = null;
    });

    return this.browser;
  }

  private async getActiveContext(): Promise<BrowserContext> {
    const browser = await this.connect();
    return browser.contexts()[0] ?? (await browser.newContext());
  }

  private async getOrCreatePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const context = await this.getActiveContext();
    const openPages = context.pages().filter((p) => !p.isClosed());

    let targetOrigin = "";
    try {
      targetOrigin = new URL(config.appointmentUrl).origin;
    } catch {
      // Ignore invalid URL and fall back to first available tab
    }

    // Prefer a tab already on the appointment portal, then a blank tab, then the first open tab
    const reusablePage =
      (targetOrigin
        ? openPages.find((p) => p.url().startsWith(targetOrigin))
        : undefined) ??
      openPages.find((p) => p.url() === "about:blank") ??
      openPages[0];

    this.page = reusablePage ?? (await context.newPage());
    this.page.setDefaultTimeout(30_000);
    return this.page;
  }

  async withPage<T>(
    taskFn: (page: Page) => Promise<{ result: T; keepTabOpen?: boolean }>,
  ): Promise<T> {
    const page = await this.getOrCreatePage();

    try {
      const outcome = await taskFn(page);

      // If a slot is found and KEEP_TAB_ON_SLOT=true, release our reference to this tab
      // so the next poll cycle does not reload over your active booking screen
      if (outcome.keepTabOpen) {
        this.page = null;
      }

      return outcome.result;
    } catch (err) {
      const error = (
        err instanceof Error ? err : new Error(String(err))
      ) as PageError;
      if (!page.isClosed()) {
        const screenshotPath = logger.getScreenshotPath("error");
        await page
          .screenshot({ path: screenshotPath, fullPage: true })
          .catch(() => {});
        error.screenshotPath = screenshotPath;
      } else {
        this.page = null;
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.page = null;
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
