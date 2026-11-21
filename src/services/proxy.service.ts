import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import { getMadridDateKey } from "@/utils/schedule";

export interface PlaywrightProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface SelectedProxy {
  id: string;
  label: string;
  playwrightProxy: PlaywrightProxyConfig;
}

interface StaticProxyState {
  id: string;
  playwrightProxy: PlaywrightProxyConfig;
  dailyDate: string;
  checksToday: number;
  rejectedCount: number;
  cooldownUntil: number;
}

const PROXY_COOLDOWN_MS = 30 * 60 * 1000; // Cool down a rejected/broken IP for 30 mins

function parseProxyLine(line: string): StaticProxyState | null {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("#")) return null;

  // Webshare download list format: ip:port:username:password
  const parts = cleaned.split(":");
  if (parts.length >= 4) {
    const [host, port, username, ...rest] = parts;
    const password = rest.join(":");
    if (!host || !port || !username || !password) return null;

    return {
      id: `${host}:${port}`,
      playwrightProxy: {
        server: `http://${host}:${port}`,
        username,
        password,
      },
      dailyDate: getMadridDateKey(),
      checksToday: 0,
      rejectedCount: 0,
      cooldownUntil: 0,
    };
  }

  // Fallback for http://user:pass@ip:port URLs
  try {
    const parsed = new URL(
      cleaned.includes("://") ? cleaned : `http://${cleaned}`,
    );
    return {
      id: `${parsed.hostname}:${parsed.port || "80"}`,
      playwrightProxy: {
        server: `${parsed.protocol}//${parsed.hostname}:${parsed.port || "80"}`,
        ...(parsed.username
          ? { username: decodeURIComponent(parsed.username) }
          : {}),
        ...(parsed.password
          ? { password: decodeURIComponent(parsed.password) }
          : {}),
      },
      dailyDate: getMadridDateKey(),
      checksToday: 0,
      rejectedCount: 0,
      cooldownUntil: 0,
    };
  } catch {
    return null;
  }
}

class ProxyService {
  private staticProxies: StaticProxyState[] = [];
  private cursor = 0;
  private residentialSessionCounter = Math.floor(1000 + Math.random() * 8000);

  isEnabled(): boolean {
    return config.proxyMode !== "none";
  }

  async init(): Promise<void> {
    if (config.proxyMode === "none") {
      console.log("[Proxy] Disabled (PROXY_MODE=none — using CDP Chrome).");
      return;
    }

    if (config.proxyMode === "residential") {
      if (
        !config.webshareResidentialUsername ||
        !config.webshareResidentialPassword
      ) {
        throw new Error(
          "WEBSHARE_RESIDENTIAL_USERNAME and WEBSHARE_RESIDENTIAL_PASSWORD are required when PROXY_MODE=residential",
        );
      }
      console.log(
        `[Proxy] Residential sticky-session mode active (${config.webshareResidentialHost}:${config.webshareResidentialPort}, country=${config.webshareResidentialCountry}).`,
      );
      return;
    }

    // PROXY_MODE=list: fetch from Webshare download URL or fall back to local file
    let rawText = "";
    if (config.webshareProxyListUrl) {
      const response = await fetch(config.webshareProxyListUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to download Webshare proxy list (HTTP ${response.status})`,
        );
      }
      rawText = await response.text();
    } else {
      const filePath = path.resolve(config.proxyListFile);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `No WEBSHARE_PROXY_LIST_URL set and ${filePath} not found.`,
        );
      }
      rawText = fs.readFileSync(filePath, "utf8");
    }

    this.staticProxies = rawText
      .split(/\r?\n/)
      .map(parseProxyLine)
      .filter((p): p is StaticProxyState => p !== null);

    if (this.staticProxies.length === 0) {
      throw new Error("Webshare proxy list loaded 0 valid proxies.");
    }

    console.log(
      `[Proxy] Loaded ${this.staticProxies.length} Webshare proxies (max ${config.maxChecksPerProxyPerDay} checks/IP/day = ${this.staticProxies.length * config.maxChecksPerProxyPerDay} checks/day capacity).`,
    );
  }

  private resetStaleDailyCounters(): void {
    const today = getMadridDateKey();
    for (const proxy of this.staticProxies) {
      if (proxy.dailyDate !== today) {
        proxy.dailyDate = today;
        proxy.checksToday = 0;
        proxy.rejectedCount = 0;
        proxy.cooldownUntil = 0;
      }
    }
  }

  acquire(): SelectedProxy | null {
    if (config.proxyMode === "none") return null;

    if (config.proxyMode === "residential") {
      this.residentialSessionCounter += 1;
      const sessionId = this.residentialSessionCounter;
      const country = config.webshareResidentialCountry;
      // Sticky session format: {username}-{country}-{sessionId}
      const username = country
        ? `${config.webshareResidentialUsername}-${country}-${sessionId}`
        : `${config.webshareResidentialUsername}-${sessionId}`;

      return {
        id: `res-${country || "any"}-${sessionId}`,
        label: `residential:${country || "any"}#${sessionId}`,
        playwrightProxy: {
          server: `http://${config.webshareResidentialHost}:${config.webshareResidentialPort}`,
          username,
          password: config.webshareResidentialPassword ?? undefined,
        },
      };
    }

    // PROXY_MODE=list: round-robin across proxies under their 5/day cap and not cooling down
    this.resetStaleDailyCounters();
    const now = Date.now();
    const total = this.staticProxies.length;

    for (let i = 0; i < total; i += 1) {
      const idx = (this.cursor + i) % total;
      const candidate = this.staticProxies[idx];
      if (!candidate) continue;

      const underDailyCap =
        config.maxChecksPerProxyPerDay === 0 ||
        candidate.checksToday < config.maxChecksPerProxyPerDay;
      const cooledDown = candidate.cooldownUntil <= now;

      if (underDailyCap && cooledDown) {
        this.cursor = (idx + 1) % total;
        return {
          id: candidate.id,
          label: `${candidate.id} (${candidate.checksToday + 1}/${config.maxChecksPerProxyPerDay})`,
          playwrightProxy: candidate.playwrightProxy,
        };
      }
    }

    return null; // All static proxies exhausted for today or currently in cooldown
  }

  hasAvailableCapacity(): {
    available: boolean;
    allExhaustedToday: boolean;
    nextCooldownWaitMs: number;
  } {
    if (config.proxyMode !== "list") {
      return {
        available: true,
        allExhaustedToday: false,
        nextCooldownWaitMs: 0,
      };
    }

    this.resetStaleDailyCounters();
    const now = Date.now();
    let underCapCount = 0;
    let earliestCooldown = Number.POSITIVE_INFINITY;

    for (const p of this.staticProxies) {
      const underCap =
        config.maxChecksPerProxyPerDay === 0 ||
        p.checksToday < config.maxChecksPerProxyPerDay;
      if (!underCap) continue;

      underCapCount += 1;
      if (p.cooldownUntil <= now) {
        return {
          available: true,
          allExhaustedToday: false,
          nextCooldownWaitMs: 0,
        };
      }
      earliestCooldown = Math.min(earliestCooldown, p.cooldownUntil - now);
    }

    if (underCapCount === 0) {
      return {
        available: false,
        allExhaustedToday: true,
        nextCooldownWaitMs: 0,
      };
    }

    return {
      available: false,
      allExhaustedToday: false,
      nextCooldownWaitMs: Math.max(15_000, earliestCooldown),
    };
  }

  reportOutcome(
    proxyId: string | null,
    outcome: "SUCCESS" | "REJECTED" | "ERROR",
  ): void {
    if (!proxyId || config.proxyMode !== "list") return;

    const proxy = this.staticProxies.find((p) => p.id === proxyId);
    if (!proxy) return;

    this.resetStaleDailyCounters();

    if (outcome === "SUCCESS") {
      proxy.checksToday += 1;
      proxy.rejectedCount = 0;
    } else {
      // WAF rejection, geo-block, or proxy connection timeout -> put this IP in cooldown
      proxy.rejectedCount += 1;
      const multiplier = Math.min(proxy.rejectedCount, 4);
      proxy.cooldownUntil = Date.now() + PROXY_COOLDOWN_MS * multiplier;
      console.warn(
        `[Proxy] ${proxy.id} marked ${outcome} (x${proxy.rejectedCount}) — cooling down for ${(PROXY_COOLDOWN_MS * multiplier) / 60_000} min.`,
      );
    }
  }
}

export const proxyService = new ProxyService();
