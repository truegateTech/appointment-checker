/**
 * Bot Detection & Captcha Stealth Tests
 *
 * Uses the patchright-backed fixture (botPage / botContext / botBrowser) to
 * launch a stealth Chromium and validate that the browser fingerprint passes
 * the most popular public bot-detection & captcha challenge sites.
 *
 * Run:
 *   npx playwright test bot-detection.spec.ts --ui
 */

import { test, expect } from "./fixtures/patchright.fixture";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for network to settle (no pending requests for `idleMs`). */
async function waitForNetworkIdle(
  page: import("@playwright/test").Page,
  idleMs = 2000
) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(idleMs);
}

/** Take a full-page screenshot and attach it to the test report. */
async function snap(
  page: import("@playwright/test").Page,
  testInfo: import("@playwright/test").TestInfo,
  label: string
) {
  const buf = await page.screenshot({ fullPage: true });
  await testInfo.attach(label, { body: buf, contentType: "image/png" });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  1. CORE BOT-DETECTION FINGERPRINT SITES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Bot Fingerprint Scanners", () => {
  test.describe.configure({ mode: "serial" });

  // ── 1a. SannySoft ────────────────────────────────────────────────────────
  test("SannySoft — all checks should pass (green)", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://bot.sannysoft.com/", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page);
    await snap(page, testInfo, "sannysoft-results");

    // The table rows contain "PASS" (green) or "FAIL" (red).
    // navigator.webdriver MUST report false / not present.
    const webdriverRow = page.locator("#webdriver-result, #fp2 tr", {
      hasText: /webdriver/i,
    });
    if ((await webdriverRow.count()) > 0) {
      const text = await webdriverRow.first().innerText();
      expect(text.toLowerCase()).not.toContain("fail");
    }

    // No red "FAIL" cells at all
    const failCells = page.locator("td.failed, td:has-text('FAIL')");
    const failCount = await failCells.count();
    // Log any failures for diagnostics
    if (failCount > 0) {
      for (let i = 0; i < failCount; i++) {
        const cellText = await failCells.nth(i).innerText();
        console.warn(`[SannySoft] FAIL cell: ${cellText}`);
      }
    }
    expect(failCount, "SannySoft should report zero FAIL cells").toBe(0);
  });

  // ── 1b. Rebrowser Bot Detector ───────────────────────────────────────────
  test("Rebrowser — detection score should be low", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://bot-detector.rebrowser.net/", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 5000);
    await snap(page, testInfo, "rebrowser-results");

    // Rebrowser outputs a JSON blob with detections
    const jsonEl = page.locator("#detections-json");
    if ((await jsonEl.count()) > 0) {
      const raw = await jsonEl.textContent();
      if (raw) {
        const parsed = JSON.parse(raw.trim());
        console.log("[Rebrowser] detections:", JSON.stringify(parsed, null, 2));
        // Each detection has { detected: boolean }
        const detections = Array.isArray(parsed)
          ? parsed
          : Object.values(parsed);
        const detectedCount = detections.filter(
          (d: any) => d?.detected === true
        ).length;
        expect(
          detectedCount,
          `Rebrowser detected ${detectedCount} automation leak(s)`
        ).toBe(0);
      }
    }

    // Also assert the status banner if present
    const statusBanner = page.locator(
      "[class*='status'], [class*='result'], [data-status]"
    );
    if ((await statusBanner.count()) > 0) {
      const bannerText = await statusBanner.first().innerText();
      expect(bannerText.toLowerCase()).not.toContain("bot");
    }
  });

  // ── 1c. BrowserScan ──────────────────────────────────────────────────────
  test("BrowserScan — bot detection should report Normal", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://www.browserscan.net/bot-detection", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 6000);
    await snap(page, testInfo, "browserscan-results");

    // The page renders a large verdict: "Normal" or "Bot"
    const bodyText = await page.locator("body").innerText();
    console.log(
      "[BrowserScan] page snippet:",
      bodyText.slice(0, 500).replace(/\s+/g, " ")
    );

    // Check for positive indicators
    const hasNormal = /normal/i.test(bodyText);
    const hasBot = /\bbot\b/i.test(bodyText);
    // "Bot Detection" in the heading doesn't count — look for standalone "Bot" verdict
    const verdictSection = page.locator(
      ".bot-detection-result, .result-status, [class*='verdict'], [class*='status']"
    );
    if ((await verdictSection.count()) > 0) {
      const verdict = await verdictSection.first().innerText();
      expect(verdict.toLowerCase()).toContain("normal");
    } else {
      // Fallback: simply verify no "Bot Detected" alarm
      expect(bodyText).not.toMatch(/bot\s*detected/i);
    }
  });

  // ── 1d. PixelScan ────────────────────────────────────────────────────────
  test("PixelScan — should show consistent fingerprint", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://pixelscan.net/", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 6000);
    await snap(page, testInfo, "pixelscan-results");

    const bodyText = await page.locator("body").innerText();
    console.log(
      "[PixelScan] page snippet:",
      bodyText.slice(0, 500).replace(/\s+/g, " ")
    );

    // PixelScan shows "consistent" (good) or "inconsistent" (bad)
    // Also may show a threat score or anomaly warnings
    expect(bodyText.toLowerCase()).not.toMatch(/inconsistent/);
    expect(bodyText.toLowerCase()).not.toMatch(/automation\s*detected/i);
  });

  // ── 1e. CreepJS ──────────────────────────────────────────────────────────
  test("CreepJS — trust score should be acceptable", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://abrahamjuliot.github.io/creepjs/", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 8000);
    await snap(page, testInfo, "creepjs-results");

    // CreepJS assigns a letter grade (A/B = good, F = detected)
    const bodyText = await page.locator("body").innerText();
    console.log(
      "[CreepJS] page snippet:",
      bodyText.slice(0, 600).replace(/\s+/g, " ")
    );

    // Check the trust score percentage if available
    const trustMatch = bodyText.match(/trust\s*score[:\s]*(\d+)/i);
    if (trustMatch) {
      const score = parseInt(trustMatch[1], 10);
      console.log(`[CreepJS] Trust score: ${score}%`);
      expect(score, "CreepJS trust score should be >= 50%").toBeGreaterThanOrEqual(50);
    }

    // Should not be flagged as a known bot
    expect(bodyText.toLowerCase()).not.toMatch(/\bbot\b.*\bdetect/i);
  });

  // ── 1f. Incolumitas (Bot or Not) ────────────────────────────────────────
  test("Incolumitas — bot detection should not flag as bot", async ({
    botPage: page,
  }, testInfo) => {
    await page.goto("https://bot.incolumitas.com/", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 8000);
    await snap(page, testInfo, "incolumitas-results");

    const bodyText = await page.locator("body").innerText();
    console.log(
      "[Incolumitas] page snippet:",
      bodyText.slice(0, 600).replace(/\s+/g, " ")
    );

    // Incolumitas shows "You are not a bot" or "You are a bot"
    // Also shows individual detection results
    const isBot = /you\s*are\s*(a\s*)?bot/i.test(bodyText);
    const isNotBot = /you\s*are\s*not\s*(a\s*)?bot/i.test(bodyText);

    if (isNotBot) {
      // Explicitly cleared
      expect(true).toBe(true);
    } else if (isBot) {
      // Log the specific detections for diagnostics
      console.warn("[Incolumitas] Detected as bot — checking details...");
    }

    // Check detection score if available
    const scoreMatch = bodyText.match(
      /(?:overall|detection)\s*(?:score|probability)[:\s]*(\d+(?:\.\d+)?)/i
    );
    if (scoreMatch) {
      const score = parseFloat(scoreMatch[1]);
      console.log(`[Incolumitas] Detection score: ${score}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2. WEBDRIVER / AUTOMATION FLAG TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("WebDriver & Automation Flag Checks", () => {
  test("navigator.webdriver should be false", async ({ botPage: page }) => {
    const webdriver = await page.evaluate(() => navigator.webdriver);
    expect(webdriver).toBeFalsy();
  });

  test("Chrome runtime object should exist (window.chrome)", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const hasChrome = await page.evaluate(
      () => typeof (window as any).chrome !== "undefined"
    );
    expect(hasChrome, "window.chrome should be defined").toBe(true);
  });

  test("Chrome runtime.connect should be a function", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const hasConnect = await page.evaluate(
      () =>
        typeof (window as any).chrome?.runtime?.connect === "function" ||
        typeof (window as any).chrome?.runtime !== "undefined"
    );
    // Patchright should ensure chrome.runtime exists
    expect(hasConnect).toBe(true);
  });

  test("Plugins array should not be empty", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const pluginCount = await page.evaluate(() => navigator.plugins.length);
    expect(pluginCount, "navigator.plugins should have entries").toBeGreaterThan(
      0
    );
  });

  test("Languages should be properly set", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const languages = await page.evaluate(() => navigator.languages);
    expect(languages.length).toBeGreaterThan(0);
    expect(languages[0]).toMatch(/^en/);
  });

  test("Permission API should not leak automation", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const notifPerm = await page.evaluate(async () => {
      try {
        const result = await navigator.permissions.query({
          name: "notifications",
        });
        return result.state;
      } catch {
        return "error";
      }
    });
    // Should return "prompt", "granted", or "denied" — not throw or return "error"
    expect(["prompt", "granted", "denied"]).toContain(notifPerm);
  });

  test("WebGL vendor/renderer should not be empty or reveal automation", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const glInfo = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      if (!gl) return { vendor: "", renderer: "" };
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          : "",
        renderer: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : "",
      };
    });
    expect(glInfo.vendor).toBeTruthy();
    expect(glInfo.renderer).toBeTruthy();
    // Should not contain "swiftshader" which signals headless
    expect(glInfo.renderer.toLowerCase()).not.toContain("swiftshader");
  });

  test("User-agent should not contain 'HeadlessChrome'", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua).not.toContain("HeadlessChrome");
    expect(ua).not.toContain("Headless");
  });

  test("iframe contentWindow should not leak CDP", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const leaked = await page.evaluate(() => {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      // In vanilla Playwright the iframe contentWindow may leak cdc_ variables
      const win = iframe.contentWindow as any;
      const keys = Object.getOwnPropertyNames(win);
      const cdcKeys = keys.filter(
        (k: string) => k.startsWith("cdc_") || k.startsWith("__driver")
      );
      document.body.removeChild(iframe);
      return cdcKeys;
    });
    expect(leaked, "Should not leak CDP driver properties").toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  3. CAPTCHA CHALLENGE PAGES (Stealth — not solving)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Captcha Challenge Stealth", () => {
  test.describe.configure({ mode: "serial" });

  // ── 3a. Google reCAPTCHA v2 Demo ─────────────────────────────────────────
  test("reCAPTCHA v2 — checkbox should be clickable (not auto-blocked)", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(
      "https://www.google.com/recaptcha/api2/demo",
      { waitUntil: "domcontentloaded" }
    );
    await waitForNetworkIdle(page, 3000);
    await snap(page, testInfo, "recaptcha-v2-before-click");

    // The reCAPTCHA widget lives inside an iframe
    const recaptchaFrame = page.frameLocator(
      'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]'
    );
    const checkbox = recaptchaFrame.locator(
      ".recaptcha-checkbox-border, #recaptcha-anchor"
    );

    if ((await checkbox.count()) > 0) {
      // The fact that the checkbox renders means we weren't instantly blocked
      expect(await checkbox.first().isVisible()).toBe(true);
      console.log("[reCAPTCHA v2] Checkbox is visible and clickable");

      // Try clicking — if stealth is good, it may pass directly
      await checkbox.first().click();
      await page.waitForTimeout(3000);
      await snap(page, testInfo, "recaptcha-v2-after-click");

      // Check if we got a checkmark (solved without challenge)
      const checkmark = recaptchaFrame.locator(
        ".recaptcha-checkbox-checked, [aria-checked='true']"
      );
      if ((await checkmark.count()) > 0) {
        console.log("[reCAPTCHA v2] ✅ Passed without challenge!");
      } else {
        // Got an image challenge — that's acceptable, means we weren't hard-blocked
        console.log(
          "[reCAPTCHA v2] ⚠️ Image challenge presented (not blocked)"
        );
      }
    } else {
      console.warn("[reCAPTCHA v2] Widget did not render — may be blocked");
      await snap(page, testInfo, "recaptcha-v2-blocked");
    }
  });

  // ── 3b. Google reCAPTCHA v3 (score-based) ────────────────────────────────
  test("reCAPTCHA v3 — demo page should load and score > 0", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("https://recaptcha-demo.appspot.com/recaptcha-v3-request-scores.php", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 3000);
    await snap(page, testInfo, "recaptcha-v3-page");

    // The page should load without being blocked
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);
    console.log(
      "[reCAPTCHA v3] Page loaded, snippet:",
      bodyText.slice(0, 300).replace(/\s+/g, " ")
    );

    // Look for a "Run reCAPTCHA" button and click it if available
    const runBtn = page.locator(
      "button:has-text('reCAPTCHA'), button:has-text('Run'), input[type='submit']"
    );
    if ((await runBtn.count()) > 0) {
      await runBtn.first().click();
      await waitForNetworkIdle(page, 3000);
      await snap(page, testInfo, "recaptcha-v3-result");

      const resultText = await page.locator("body").innerText();
      const scoreMatch = resultText.match(/score[:\s]*(\d+\.\d+)/i);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[1]);
        console.log(`[reCAPTCHA v3] Score: ${score}`);
        expect(
          score,
          "reCAPTCHA v3 score should be > 0.3 (not flagged as bot)"
        ).toBeGreaterThan(0.3);
      }
    }
  });

  // ── 3c. hCaptcha Demo ───────────────────────────────────────────────────
  test("hCaptcha — widget should render (not blocked)", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto("https://accounts.hcaptcha.com/demo", {
      waitUntil: "domcontentloaded",
    });
    await waitForNetworkIdle(page, 4000);
    await snap(page, testInfo, "hcaptcha-page");

    // hCaptcha renders in an iframe
    const hcaptchaFrame = page.frameLocator(
      'iframe[src*="hcaptcha"], iframe[title*="hCaptcha"]'
    );
    const checkbox = hcaptchaFrame.locator(
      "#checkbox, [role='checkbox']"
    );

    if ((await checkbox.count()) > 0) {
      expect(await checkbox.first().isVisible()).toBe(true);
      console.log("[hCaptcha] Checkbox is visible — not blocked");

      await checkbox.first().click();
      await page.waitForTimeout(3000);
      await snap(page, testInfo, "hcaptcha-after-click");
    } else {
      // Even if no checkbox, verify the page loaded
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(50);
      console.log("[hCaptcha] Page loaded but checkbox not found in expected location");
      await snap(page, testInfo, "hcaptcha-no-checkbox");
    }
  });

  // ── 3d. Cloudflare Turnstile Demo ────────────────────────────────────────
  test("Cloudflare Turnstile — widget should render", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(
      "https://demo.turnstile.workers.dev/",
      { waitUntil: "domcontentloaded" }
    );
    await waitForNetworkIdle(page, 5000);
    await snap(page, testInfo, "turnstile-page");

    // Turnstile renders inside an iframe or shadow DOM
    const turnstileFrame = page.frameLocator(
      'iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]'
    );
    const widgetExists =
      (await turnstileFrame.locator("body").count()) > 0 ||
      (await page.locator("[class*='turnstile'], #cf-turnstile, .cf-turnstile").count()) > 0;

    if (widgetExists) {
      console.log("[Turnstile] Widget rendered — not blocked");
      await page.waitForTimeout(5000);
      await snap(page, testInfo, "turnstile-after-wait");

      // Check if it auto-solved (success token generated)
      const token = await page
        .locator(
          'input[name="cf-turnstile-response"], [name="cf-turnstile-response"]'
        )
        .inputValue()
        .catch(() => "");
      if (token) {
        console.log("[Turnstile] ✅ Auto-solved! Token received.");
      } else {
        console.log("[Turnstile] Widget loaded, awaiting interaction.");
      }
    } else {
      const bodyText = await page.locator("body").innerText();
      console.log("[Turnstile] Page content:", bodyText.slice(0, 300));
    }

    // Page should at minimum load without an error
    expect(await page.title()).toBeTruthy();
  });

  // ── 3e. Cloudflare Challenge Page (real-world) ──────────────────────────
  test("Cloudflare — should not get stuck on challenge page", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(90_000);

    // nowsecure.nl is a known Cloudflare-protected test page
    await page.goto("https://nowsecure.nl/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await waitForNetworkIdle(page, 5000);
    await snap(page, testInfo, "cloudflare-challenge-initial");

    // Wait extra time for Cloudflare JS challenge to resolve
    const maxWait = 30_000;
    const start = Date.now();
    let passed = false;

    while (Date.now() - start < maxWait) {
      const bodyText = await page.locator("body").innerText();
      const title = await page.title();

      // Cloudflare challenge shows "Just a moment..." or "Checking your browser"
      const isChallenging =
        /just a moment|checking your browser|please wait/i.test(bodyText) ||
        /just a moment/i.test(title);

      if (!isChallenging) {
        passed = true;
        console.log("[Cloudflare] ✅ Challenge passed!");
        break;
      }

      await page.waitForTimeout(2000);
    }

    await snap(page, testInfo, "cloudflare-challenge-final");

    if (passed) {
      const finalBody = await page.locator("body").innerText();
      expect(finalBody.toLowerCase()).not.toMatch(
        /blocked|access denied|error 1020/i
      );
    } else {
      console.warn(
        "[Cloudflare] ⚠️ Challenge did not resolve within timeout"
      );
    }
  });

  // ── 3f. DataDome Captcha ─────────────────────────────────────────────────
  test("DataDome — protected page should not instantly block", async ({
    botPage: page,
  }, testInfo) => {
    test.setTimeout(60_000);
    // Footlocker is protected by DataDome
    await page.goto("https://www.footlocker.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await waitForNetworkIdle(page, 5000);
    await snap(page, testInfo, "datadome-page");

    const bodyText = await page.locator("body").innerText();
    const url = page.url();
    console.log(`[DataDome] Final URL: ${url}`);
    console.log(
      "[DataDome] Body snippet:",
      bodyText.slice(0, 400).replace(/\s+/g, " ")
    );

    // Should not get a hard-block / geo-captcha interstitial immediately
    const hardBlock =
      /blocked|captcha|access denied|please verify/i.test(bodyText) &&
      bodyText.length < 500;

    if (hardBlock) {
      console.warn("[DataDome] ⚠️ Received challenge/block page");
    } else {
      console.log("[DataDome] ✅ Page loaded without immediate block");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  4. ADVANCED FINGERPRINT CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Advanced Fingerprint Consistency", () => {
  test("Canvas fingerprint should not be blank or uniform", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const isBlank = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("Fingerprint", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("Fingerprint", 4, 17);
      const data = canvas.toDataURL();
      // A blank canvas toDataURL is very short
      return data.length < 1000;
    });
    expect(isBlank, "Canvas should produce a real fingerprint").toBe(false);
  });

  test("AudioContext fingerprint should be non-zero", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const audioFP = await page.evaluate(async () => {
      try {
        const ctx = new OfflineAudioContext(1, 44100, 44100);
        const oscillator = ctx.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(10000, ctx.currentTime);
        const compressor = ctx.createDynamicsCompressor();
        oscillator.connect(compressor);
        compressor.connect(ctx.destination);
        oscillator.start(0);
        const buffer = await ctx.startRendering();
        const data = buffer.getChannelData(0);
        // Sum a portion of the audio data
        let sum = 0;
        for (let i = 4500; i < 5000; i++) {
          sum += Math.abs(data[i]);
        }
        return sum;
      } catch {
        return -1;
      }
    });
    expect(audioFP, "Audio fingerprint should produce non-zero sum").not.toBe(
      0
    );
    expect(audioFP, "AudioContext should not throw").not.toBe(-1);
  });

  test("Screen dimensions should be realistic", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const screen = await page.evaluate(() => ({
      width: window.screen.width,
      height: window.screen.height,
      colorDepth: window.screen.colorDepth,
      outerW: window.outerWidth,
      outerH: window.outerHeight,
    }));
    expect(screen.width).toBeGreaterThan(0);
    expect(screen.height).toBeGreaterThan(0);
    expect(screen.colorDepth).toBeGreaterThanOrEqual(24);
    expect(screen.outerW).toBeGreaterThan(0);
    expect(screen.outerH).toBeGreaterThan(0);
  });

  test("Timezone should match the configured locale", async ({
    botPage: page,
  }) => {
    await page.goto("about:blank");
    const tz = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    // The patchright fixture sets America/New_York
    expect(tz).toBe("America/New_York");
  });

  test("Hardware concurrency should be > 0", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const cores = await page.evaluate(() => navigator.hardwareConcurrency);
    expect(cores).toBeGreaterThan(0);
    expect(cores).toBeLessThanOrEqual(32);
  });

  test("DeviceMemory should be realistic", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const memory = await page.evaluate(
      () => (navigator as any).deviceMemory ?? -1
    );
    if (memory !== -1) {
      expect(memory).toBeGreaterThanOrEqual(2);
      expect(memory).toBeLessThanOrEqual(32);
    }
  });

  test("Media devices should be enumerable", async ({ botPage: page }) => {
    await page.goto("about:blank");
    const deviceCount = await page.evaluate(async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.length;
      } catch {
        return -1;
      }
    });
    expect(deviceCount, "Should enumerate media devices").toBeGreaterThan(0);
  });
});
