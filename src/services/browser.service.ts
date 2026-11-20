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

  private async getOrCreatePage(targetUrl: string): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    const context = await this.getActiveContext();
    if (!config.reuseTab) {
      this.page = await context.newPage();
      this.page.setDefaultTimeout(30_000);
      return this.page;
    }

    const openPages = context.pages().filter((p) => !p.isClosed());
    let targetOrigin = "";
    try {
      targetOrigin = new URL(targetUrl).origin;
    } catch {
      // Fallback to first open tab
    }

    const reusable =
      (targetOrigin
        ? openPages.find((p) => p.url().startsWith(targetOrigin))
        : undefined) ??
      openPages.find((p) => p.url() === "about:blank") ??
      openPages[0];

    this.page = reusable ?? (await context.newPage());
    this.page.setDefaultTimeout(30_000);
    return this.page;
  }

  async withPage<T>(
    targetUrl: string,
    taskFn: (page: Page) => Promise<{ result: T; keepTabOpen?: boolean }>,
  ): Promise<T> {
    const page = await this.getOrCreatePage(targetUrl);

    try {
      const outcome = await taskFn(page);

      if (outcome.keepTabOpen) {
        // Leave this tab open for manual booking and detach it from future polls
        await page.bringToFront().catch(() => {});
        this.page = null;
      } else if (!config.reuseTab) {
        await page.close().catch(() => {});
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
        if (!config.reuseTab) {
          await page.close().catch(() => {});
          this.page = null;
        }
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
