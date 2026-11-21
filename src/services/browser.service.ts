import fs from "node:fs";
import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "patchright";
import { config } from "@/config/env";
import { logger } from "@/services/logger.service";
import type { SelectedProxy } from "@/services/proxy.service";
import type { ProxyOutcome } from "@/types/monitor.types";

export interface PageError extends Error {
  screenshotPath?: string;
}

type ProxyWithGeo = SelectedProxy & {
  locale?: string;
  timezoneId?: string;
};

const IP_PROBE_URL = "https://ipv4.webshare.io/";
const PROFILES_ROOT = path.resolve("data/browser-profiles");
const DEFAULT_LOCALE = "es-ES";
const DEFAULT_TIMEZONE_ID = "Europe/Madrid";

function getUserDataDir(proxy: SelectedProxy): string {
  // Residential mode generates a brand-new session ID every check:
  // passing "" lets Playwright auto-create & clean up a temporary profile dir
  // so disk usage doesn't grow by ~50 MB per cycle.
  if (proxy.mode === "residential") {
    return "";
  }

  // Static/sticky profile mode: one persistent Chrome profile folder per proxy ID
  const safeName = proxy.id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const profileDir = path.join(PROFILES_ROOT, safeName);
  fs.mkdirSync(profileDir, { recursive: true });
  return profileDir;
}

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
  private readonly activeContexts = new Set<BrowserContext>();
  private isBusy = false;

  async connect(): Promise<Browser | null> {
    if (config.proxyMode === "none") {
      this.isCdpMode = true;
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

    // In proxy mode, launchPersistentContext() spawns the browser per profile in withPage()
    this.isCdpMode = false;
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });
    return null;
  }

  private async getSingleCdpPage(targetUrl: string): Promise<Page> {
    if (this.pollingPage && !this.pollingPage.isClosed()) {
      return this.pollingPage;
    }

    const browser = await this.connect();
    if (!browser) {
      throw new Error("CDP browser is not connected.");
    }

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
    proxy?: ProxyWithGeo | null,
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
    let outcome: ProxyOutcome = "SUCCESS";
    let errorMessage: string | undefined;

    try {
      if (config.proxyMode === "none") {
        this.isCdpMode = true;
        page = await this.getSingleCdpPage(targetUrl);
      } else {
        this.isCdpMode = false;
        if (!proxy) {
          throw new Error("Proxy mode is enabled but no proxy was provided.");
        }

        const userDataDir = getUserDataDir(proxy);
        const context = await chromium.launchPersistentContext(userDataDir, {
          headless: config.headless,
          channel: config.browserChannel,
          viewport: config.headless ? { width: 1920, height: 1080 } : null, // TS equivalent of no_viewport=True
          args: ["--start-maximized"],
          proxy: proxy.playwrightProxy,
          timezoneId: proxy.timezoneId ?? DEFAULT_TIMEZONE_ID,
          locale: proxy.locale ?? DEFAULT_LOCALE,
        });

        contextToClose = context;
        this.activeContexts.add(context);
        context.on("close", () => {
          this.activeContexts.delete(context);
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

        if (config.isDev) {
          const probe = await probeProxyExit(context);
          exitIp = probe.exitIp;
          probeLatencyMs = probe.probeLatencyMs;
        }

        // Reuse the default blank tab created by launchPersistentContext
        page = context.pages()[0] ?? (await context.newPage());
        page.setDefaultTimeout(35_000);
      }

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
      if (maybeStatus === "IP_BLOCKED") {
        outcome = "IP_BLOCKED";
      } else if (maybeStatus === "REJECTED") {
        outcome = "REJECTED";
      }

      if (taskOutcome.keepTabOpen) {
        this.lockedSlotPages.add(page);
        await page.bringToFront().catch(() => {});
        if (this.isCdpMode) {
          this.pollingPage = null;
        } else {
          // Keep this persistent profile window open so you can finish booking
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

    for (const ctx of Array.from(this.activeContexts)) {
      await ctx.close().catch(() => {});
    }
    this.activeContexts.clear();

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export const browserService = new BrowserService();
