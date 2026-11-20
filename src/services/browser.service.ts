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
  private pollingPage: Page | null = null;
  private readonly lockedSlotPages = new WeakSet<Page>();
  private isBusy = false;

  async connect(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    this.browser = await chromium.connectOverCDP(config.cdpUrl);
    this.browser.on("disconnected", () => {
      this.browser = null;
      this.pollingPage = null;
    });

    return this.browser;
  }

  private async getActiveContext(): Promise<BrowserContext> {
    const browser = await this.connect();
    return browser.contexts()[0] ?? (await browser.newContext());
  }

  private async getSinglePollingPage(targetUrl: string): Promise<Page> {
    if (this.pollingPage && !this.pollingPage.isClosed()) {
      return this.pollingPage;
    }

    const context = await this.getActiveContext();
    const availablePages = context
      .pages()
      .filter((p) => !p.isClosed() && !this.lockedSlotPages.has(p));

    if (config.reuseTab && availablePages.length > 0) {
      let targetOrigin = "";
      try {
        targetOrigin = new URL(targetUrl).origin;
      } catch {
        // Ignore invalid URL
      }

      this.pollingPage =
        (targetOrigin
          ? availablePages.find((p) => p.url().startsWith(targetOrigin))
          : undefined) ??
        availablePages.find((p) => p.url() === "about:blank") ??
        availablePages[0] ??
        null;
    }

    if (!this.pollingPage) {
      this.pollingPage = await context.newPage();
    }

    this.pollingPage.setDefaultTimeout(30_000);
    return this.pollingPage;
  }

  async withPage<T>(
    targetUrl: string,
    taskFn: (page: Page) => Promise<{ result: T; keepTabOpen?: boolean }>,
  ): Promise<T> {
    if (this.isBusy) {
      throw new Error("BrowserService is already running a slot check.");
    }

    this.isBusy = true;
    let page: Page | null = null;

    try {
      page = await this.getSinglePollingPage(targetUrl);
      const outcome = await taskFn(page);

      if (outcome.keepTabOpen) {
        // Preserve this tab for manual booking and detach it from future polls
        this.lockedSlotPages.add(page);
        await page.bringToFront().catch(() => {});
        this.pollingPage = null;
      } else if (!config.reuseTab) {
        await page.close().catch(() => {});
        this.pollingPage = null;
      }

      return outcome.result;
    } catch (err) {
      const error = (
        err instanceof Error ? err : new Error(String(err))
      ) as PageError;
      if (page && !page.isClosed()) {
        const screenshotPath = logger.getScreenshotPath("error");
        await page
          .screenshot({ path: screenshotPath, fullPage: true })
          .catch(() => {});
        error.screenshotPath = screenshotPath;
        if (!config.reuseTab) {
          await page.close().catch(() => {});
          this.pollingPage = null;
        }
      } else {
        this.pollingPage = null;
      }
      throw error;
    } finally {
      this.isBusy = false;
    }
  }

  async disconnect(): Promise<void> {
    this.pollingPage = null;
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
