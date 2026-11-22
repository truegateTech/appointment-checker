/**
 * capture-site.ts
 *
 * Interactive session recorder — browse a site manually, and every page you
 * visit is automatically captured:
 *   - Full rendered HTML  (saved as  pages/<route>.html)
 *   - Screenshot          (saved as  pages/<route>.png)
 *   - Cookies             (saved as  pages/<route>.cookies.json)
 *   - localStorage + sessionStorage  (pages/<route>.storage.json)
 *   - Per-page network log (pages/<route>.network.json)
 *   - Full HAR file for the entire session (session/traffic.har)
 *   - Final storage state reusable in future scripts (session/storage_state.json)
 *   - Session-wide action log (session/actions.json)
 *
 * Usage:
 *   npm run capture:record -- https://example.com
 *
 * Browse as you normally would. Close the browser (or press Ctrl+C in the
 * terminal) when you are done — everything is flushed to disk on exit.
 */

import { chromium } from "patchright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// ─── ESM __dirname shim ───────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CLI arg ──────────────────────────────────────────────────────────────────
const START_URL = process.argv[2];
if (!START_URL) {
  console.error(
    "Usage: npm run capture:record -- <start-url>\n" +
      "Example: npm run capture:record -- https://example.com"
  );
  process.exit(1);
}

// ─── Output directories ───────────────────────────────────────────────────────
const SESSION_ID = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);
const OUT_DIR = path.join(__dirname, "captures", SESSION_ID);
const PAGES_DIR = path.join(OUT_DIR, "pages");
const SESSION_DIR = path.join(OUT_DIR, "session");

fs.mkdirSync(PAGES_DIR, { recursive: true });
fs.mkdirSync(SESSION_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a URL pathname + search into a safe filesystem slug. */
function urlToSlug(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    const raw = (u.pathname + u.search)
      .replace(/^\//, "") // strip leading /
      .replace(/\/+$/, "") // strip trailing /
      .replace(/[^\w\-./]/g, "_") // replace unsafe chars
      .replace(/\//g, "__"); // replace path separators with __
    return raw || "index";
  } catch {
    return "unknown";
  }
}

/** Dump a Web Storage object (localStorage / sessionStorage) to a plain record. */
function dumpStorage(store: Storage): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)!;
    out[k] = store.getItem(k);
  }
  return out;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NetworkEntry {
  type: "request" | "response";
  url: string;
  method?: string;
  status?: number;
  headers: Record<string, string>;
  postData?: string | null;
  resourceType?: string;
  bodySnippet?: string | null;
  timestamp: number;
}

interface PageCapture {
  url: string;
  slug: string;
  capturedAt: string;
  title: string;
  htmlFile: string;
  screenshotFile: string;
  cookiesFile: string;
  storageFile: string;
  networkFile: string;
  networkEntryCount: number;
}

interface ActionEntry {
  event: string;
  url?: string;
  slug?: string;
  timestamp: string;
  detail?: string;
}

// ─── Global session state ─────────────────────────────────────────────────────

const sessionActions: ActionEntry[] = [];
// Per-page network entries, keyed by slug (may accumulate across sub-requests)
const pageNetworkMap = new Map<string, NetworkEntry[]>();
let currentSlug = "index";

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n🎬  capture-site — Interactive Session Recorder`);
  console.log(`📁  Output: ${OUT_DIR}`);
  console.log(`🌐  Starting at: ${START_URL}`);
  console.log(`\nBrowse the site normally. Close the browser when done.\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: null, // use the full window
    recordHar: {
      path: path.join(SESSION_DIR, "traffic.har"),
      content: "embed",
    },
  });

  const page = await context.newPage();

  // ── Network listeners ──────────────────────────────────────────────────────
  page.on("request", (req) => {
    const entry: NetworkEntry = {
      type: "request",
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      postData: req.postData(),
      resourceType: req.resourceType(),
      timestamp: Date.now(),
    };
    if (!pageNetworkMap.has(currentSlug)) {
      pageNetworkMap.set(currentSlug, []);
    }
    pageNetworkMap.get(currentSlug)!.push(entry);
  });

  page.on("response", async (res) => {
    let bodySnippet: string | null = null;
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (/json|text|html|xml/.test(ct)) {
        const buf = await res.body();
        bodySnippet = buf.slice(0, 8000).toString("utf8");
      }
    } catch {
      // Redirects / aborted responses may not have a readable body
    }

    const entry: NetworkEntry = {
      type: "response",
      url: res.url(),
      status: res.status(),
      headers: res.headers(),
      bodySnippet,
      timestamp: Date.now(),
    };
    if (!pageNetworkMap.has(currentSlug)) {
      pageNetworkMap.set(currentSlug, []);
    }
    pageNetworkMap.get(currentSlug)!.push(entry);
  });

  // ── Capture helper (called after every navigation) ─────────────────────────
  const captures: PageCapture[] = [];
  const capturedSlugs = new Set<string>();

  async function capturePage(label: string): Promise<void> {
    // Wait briefly for any late XHR / hydration to settle
    try {
      await page.waitForLoadState("networkidle", { timeout: 8000 });
    } catch {
      // networkidle may time-out on heavy SPAs — that's fine
    }
    await page.waitForTimeout(800);

    const url = page.url();
    const slug = urlToSlug(url);
    const title = await page.title().catch(() => "(unknown)");
    currentSlug = slug; // keep network map in sync

    // Deduplicate: if the same slug has already been captured this session,
    // append a counter so we don't overwrite the first visit.
    let finalSlug = slug;
    if (capturedSlugs.has(slug)) {
      let n = 2;
      while (capturedSlugs.has(`${slug}_v${n}`)) n++;
      finalSlug = `${slug}_v${n}`;
    }
    capturedSlugs.add(finalSlug);
    currentSlug = finalSlug;

    const base = path.join(PAGES_DIR, finalSlug);
    const htmlFile = `pages/${finalSlug}.html`;
    const screenshotFile = `pages/${finalSlug}.png`;
    const cookiesFile = `pages/${finalSlug}.cookies.json`;
    const storageFile = `pages/${finalSlug}.storage.json`;
    const networkFile = `pages/${finalSlug}.network.json`;
    const capturedAt = new Date().toISOString();

    console.log(`\n📸  [${label}] Capturing: ${url}`);
    console.log(`     Slug : ${finalSlug}`);
    console.log(`     Title: ${title}`);

    // Full rendered HTML
    const html = await page.content();
    fs.writeFileSync(`${base}.html`, html);

    // Full-page screenshot
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {
      console.warn("     ⚠️  Screenshot failed (page may have navigated away)");
    });

    // Cookies (all, incl. HttpOnly)
    const cookies = await context.cookies();
    fs.writeFileSync(`${base}.cookies.json`, JSON.stringify(cookies, null, 2));

    // localStorage + sessionStorage
    const storage = await page
      .evaluate(({ dumpFn }: { dumpFn: string }) => {
        // eslint-disable-next-line no-new-func
        const dump = new Function("store", `return (${dumpFn})(store)`) as (
          store: Storage
        ) => Record<string, string | null>;
        return {
          localStorage: dump(window.localStorage),
          sessionStorage: dump(window.sessionStorage),
        };
      }, { dumpFn: dumpStorage.toString() })
      .catch(() => ({ localStorage: {}, sessionStorage: {} }));
    fs.writeFileSync(`${base}.storage.json`, JSON.stringify(storage, null, 2));

    // Per-page network log
    const networkEntries = pageNetworkMap.get(finalSlug) ?? [];
    fs.writeFileSync(
      `${base}.network.json`,
      JSON.stringify(networkEntries, null, 2)
    );
    // Reset for next page
    pageNetworkMap.delete(finalSlug);

    const capture: PageCapture = {
      url,
      slug: finalSlug,
      capturedAt,
      title,
      htmlFile,
      screenshotFile,
      cookiesFile,
      storageFile,
      networkFile,
      networkEntryCount: networkEntries.length,
    };
    captures.push(capture);

    sessionActions.push({
      event: "page-captured",
      url,
      slug: finalSlug,
      timestamp: capturedAt,
      detail: title,
    });

    console.log(
      `     ✅  Saved HTML, screenshot, cookies, storage & ${networkEntries.length} network entries`
    );
  }

  // ── Navigation listener — fires on every URL change ────────────────────────
  page.on("framenavigated", async (frame) => {
    if (frame !== page.mainFrame()) return; // ignore iframes
    const url = frame.url();
    if (!url || url === "about:blank") return;

    // Update the current slug for network attribution immediately
    currentSlug = urlToSlug(url);

    sessionActions.push({
      event: "navigation",
      url,
      timestamp: new Date().toISOString(),
    });

    // Small debounce — wait for the page to fully settle before capturing
    // (avoids double-captures during redirects)
    setTimeout(async () => {
      if (page.url() !== url) return; // already navigated away
      await capturePage("navigation").catch(console.error);
      // Write the index after each capture so it's always up to date
      writeIndex();
    }, 1200);
  });

  // ── Write session index ────────────────────────────────────────────────────
  function writeIndex(): void {
    fs.writeFileSync(
      path.join(OUT_DIR, "index.json"),
      JSON.stringify(
        {
          sessionId: SESSION_ID,
          startUrl: START_URL,
          capturedAt: new Date().toISOString(),
          pageCount: captures.length,
          pages: captures,
        },
        null,
        2
      )
    );
  }

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  async function shutdown(reason: string): Promise<void> {
    console.log(`\n\n⏹️  Stopping (${reason})…`);

    // Final capture of whatever page is currently open
    try {
      await capturePage("shutdown-capture");
    } catch {
      // best-effort
    }

    // Session-wide storage state (reusable in future scripts)
    await context
      .storageState({ path: path.join(SESSION_DIR, "storage_state.json") })
      .catch(() => {});

    // HAR is flushed when context closes
    await context.close().catch(() => {});
    await browser.close().catch(() => {});

    // Final session action log
    fs.writeFileSync(
      path.join(SESSION_DIR, "actions.json"),
      JSON.stringify(sessionActions, null, 2)
    );

    writeIndex();

    console.log(`\n✅  Session saved to: ${OUT_DIR}`);
    console.log(`   Pages captured : ${captures.length}`);
    console.log(`   pages/          → per-route HTML, screenshot, cookies, storage, network`);
    console.log(`   session/        → traffic.har, storage_state.json, actions.json`);
    console.log(`   index.json      → full page manifest\n`);

    process.exit(0);
  }

  // Handle Ctrl+C
  process.on("SIGINT", () => void shutdown("Ctrl+C"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // Handle the user closing the browser window
  browser.on("disconnected", () => void shutdown("browser closed"));

  // ── Launch ────────────────────────────────────────────────────────────────
  await page.goto(START_URL, { waitUntil: "domcontentloaded" });

  console.log(
    "🚀  Browser is open. Navigate freely — every page visit is captured automatically."
  );
  console.log("   Close the browser or press Ctrl+C when finished.\n");

  // Keep the process alive until the browser disconnects or Ctrl+C is pressed
  await new Promise<void>((resolve) => {
    browser.on("disconnected", () => resolve());
    process.on("SIGINT", () => resolve());
    process.on("SIGTERM", () => resolve());
  });
})();
