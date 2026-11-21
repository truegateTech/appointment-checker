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

const IP_PROBE_URL = "https://ipv4.webshare.io/";

async function probeProxyExit(
  context: BrowserContext,
): Promise<{ exitIp: string | null; probeLatencyMs: number | null }> {
  const startedAt = Date.now();
  try {
    const res = await context.request.get(IP_PROBE_URL, { timeout: 10_000 });
    const probeLatencyMs = Date.now() - startedAt;
    if (!res.ok()) {
      return { exitIp: null, probeLatencyMs };
    }
    const exitIp = (await res.text()).trim() || null;
    return { exitIp, probeLatencyMs };
  } catch {
    return { exitIp: null, probeLatencyMs: Date.now() - startedAt };
  }
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
      this.browser = await chromium.connectOverCDP(config.cdpUrl);
      this.isCdpMode = true;
    } else {
      this.isCdpMode = false;
      this.browser = await chromium.launch({
        headless: config.headless,
        channel: config.browserChannel,
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
    const totalStartedAt = Date.now();
    let contextToClose: BrowserContext | null = null;
    let page: Page | null = null;

    let exitIp: string | null = null;
    let probeLatencyMs: number | null = null;
    let portalTtfbMs: number | null = null;
    let portalHttpStatus: number | null = null;
    let outcome: "SUCCESS" | "REJECTED" | "ERROR" = "SUCCESS";
    let errorMessage: string | undefined;

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

        await context.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });
        });

        if (config.blockHeavyAssets) {
          await context.route("**/*", (route) => {
            const type = route.request().resourceType();
            if (type === "image" || type === "media" || type === "font") {
              return route.abort();
            }
            return route.continue();
          });
        }

        // Dev-only lightweight probe: confirms exit IP and proxy round-trip latency
        if (config.isDev) {
          const probe = await probeProxyExit(context);
          exitIp = probe.exitIp;
          probeLatencyMs = probe.probeLatencyMs;
        }

        page = await context.newPage();
        page.setDefaultTimeout(35_000);
      }

      // Dev-only listener: measure first main-document response from target portal
      if (config.isDev && page) {
        const navStartedAt = Date.now();
        let captured = false;
        page.on("response", (res) => {
          if (captured) return;
          if (
            res.request().isNavigationRequest() &&
            res.frame() === page?.mainFrame()
          ) {
            captured = true;
            portalHttpStatus = res.status();
            portalTtfbMs = Date.now() - navStartedAt;
          }
        });
      }

      const taskOutcome = await taskFn(page);

      const maybeStatus = (taskOutcome.result as { status?: string } | null)
        ?.status;
      if (maybeStatus === "REJECTED") {
        outcome = "REJECTED";
      }

      if (taskOutcome.keepTabOpen) {
        this.lockedSlotPages.add(page);
        await page.bringToFront().catch(() => {});
        if (this.isCdpMode) {
          this.pollingPage = null;
        } else {
          contextToClose = null;
        }
      } else if (this.isCdpMode && !config.reuseTab) {
        await page.close().catch(() => {});
        this.pollingPage = null;
      }

      return taskOutcome.result;
    } catch (err) {
      outcome = "ERROR";
      const error = (
        err instanceof Error ? err : new Error(String(err))
      ) as PageError;
      errorMessage = error.message;

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
      if (config.isDev) {
        logger.recordProxyDevLog({
          timestamp: new Date().toISOString(),
          mode: config.proxyMode,
          proxyId: proxy?.id ?? "direct-cdp",
          server: proxy?.server ?? config.cdpUrl,
          username: proxy?.username ?? null,
          exitIp,
          probeLatencyMs,
          portalTtfbMs,
          portalHttpStatus,
          totalDurationMs: Date.now() - totalStartedAt,
          outcome,
          targetUrl,
          ...(errorMessage ? { error: errorMessage } : {}),
        });
      }

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
