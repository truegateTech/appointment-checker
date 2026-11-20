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

  async connect(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    this.browser = await chromium.connectOverCDP(config.cdpUrl);
    return this.browser;
  }

  private async getActiveContext(): Promise<BrowserContext> {
    const browser = await this.connect();
    return browser.contexts()[0] ?? (await browser.newContext());
  }

  async withPage<T>(
    taskFn: (page: Page) => Promise<{ result: T; keepTabOpen?: boolean }>,
  ): Promise<T> {
    const context = await this.getActiveContext();
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    let keepTabOpen = false;

    try {
      const outcome = await taskFn(page);
      keepTabOpen = Boolean(outcome.keepTabOpen);
      return outcome.result;
    } catch (err) {
      const error = (
        err instanceof Error ? err : new Error(String(err))
      ) as PageError;
      const screenshotPath = logger.getScreenshotPath("error");
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => {});
      error.screenshotPath = screenshotPath;
      throw error;
    } finally {
      if (!keepTabOpen) {
        await page.close().catch(() => {});
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
