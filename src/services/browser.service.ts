import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { config } from "@/config/env";
import { logger } from "@/services/logger.service";
import type { SelectedProxy } from "@/services/proxy.service";

export interface PageError extends Error {
  screenshotPath?: string;
}

class BrowserService {
  private browser: Browser | null = null;
  private isCdpMode = false;
  private pollingPage: Page | null = null;
  private readonly lockedSlotPages = new WeakSet<Page>();
  private isBusy = false;

  async connect(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (config.proxyMode === "none") {
      this.isCdpMode = true;
      this.browser = await chromium.connectOverCDP(config.cdpUrl);
    } else {
      this.isCdpMode = false;
      this.browser = await chromium.launch({
        headless: config.headless,
        channel: config.browserChannel,
        // Enables per-context proxy overrides across Windows, macOS, and Linux
        proxy: { server: "http://per-context" },
        args: ["--disable-blink-features=AutomationControlled"],
      });
    }

    this.browser.on("disconnected", () => {
      this.browser = null;
      this.pollingPage = null;
    });

    return this.browser;
  }

  private async getSingleCdpPage(targetUrl: string): Promise<Page> {
    if (this.pollingPage && !this.pollingPage.isClosed()) {
      return this.pollingPage;
    }

    const browser = await this.connect();
    const context = browser.contexts()[0] ?? (await browser.newContext());
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
    proxy?: SelectedProxy | null,
  ): Promise<T> {
    if (this.isBusy) {
      throw new Error("BrowserService is already running a slot check.");
    }

    this.isBusy = true;
    let contextToClose: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      const browser = await this.connect();

      if (this.isCdpMode) {
        page = await this.getSingleCdpPage(targetUrl);
      } else {
        if (!proxy) {
          throw new Error("Proxy mode is enabled but no proxy was provided.");
        }

        const context = await browser.newContext({
          proxy: proxy.playwrightProxy,
          locale: "es-ES",
          timezoneId: "Europe/Madrid",
          viewport: { width: 1366, height: 768 },
        });
        contextToClose = context;

        // Mask navigator.webdriver just like your original test script
        await context.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });
        });

        // Save proxy bandwidth by dropping non-essential heavy assets
        if (config.blockHeavyAssets) {
          await context.route("**/*", (route) => {
            const type = route.request().resourceType();
            if (type === "image" || type === "media" || type === "font") {
              return route.abort();
            }
            return route.continue();
          });
        }

        page = await context.newPage();
        page.setDefaultTimeout(35_000);
      }

      const outcome = await taskFn(page);

      if (outcome.keepTabOpen) {
        this.lockedSlotPages.add(page);
        await page.bringToFront().catch(() => {});
        if (this.isCdpMode) {
          this.pollingPage = null;
        } else {
          // Keep this context open so you can book immediately on the same proxy IP
          contextToClose = null;
        }
      } else if (this.isCdpMode && !config.reuseTab) {
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
      }
      if (this.isCdpMode && !config.reuseTab && page && !page.isClosed()) {
        await page.close().catch(() => {});
        this.pollingPage = null;
      }
      throw error;
    } finally {
      if (contextToClose) {
        await contextToClose.close().catch(() => {});
      }
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
