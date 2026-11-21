import fs from "node:fs";
import path from "node:path";
import { config } from "@/config/env";
import { dbService } from "@/services/db.service";
import type { ProxyOutcome } from "@/types/monitor.types";
import { getMadridDateKey } from "@/utils/schedule";

export interface PlaywrightProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export interface SelectedProxy {
  id: string;
  label: string;
  mode: "list" | "residential";
  server: string;
  username: string | null;
  exitIp?: string | null;
  playwrightProxy: PlaywrightProxyConfig;
}

interface StaticProxyState {
  id: string;
  server: string;
  username: string | null;
  playwrightProxy: PlaywrightProxyConfig;
  dailyDate: string;
  checksToday: number;
  rejectedCount: number;
  cooldownUntil: number;
  lastUsedAt: number;
}

const PROXY_COOLDOWN_MS = 30 * 60 * 1000;
const DAILY_IP_BLOCK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function extractBaseUsername(raw: string): string {
  return raw
    .trim()
    .replace(
      /-(?:[a-z]{2}(?:-[a-z]{2})*)(?:-(?:city_[a-z_]+))?(?:-(?:\d+|rotate))?$/i,
      "",
    )
    .replace(/-(?:\d+|rotate)$/i, "");
}

function parseProxyLine(line: string): StaticProxyState | null {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("#")) return null;

  const parts = cleaned.split(":");
  if (parts.length >= 4) {
    const [host, port, username, ...rest] = parts;
    const password = rest.join(":");
    if (!host || !port || !username || !password) return null;

    const server = `http://${host}:${port}`;
    return {
      id: `${host}:${port}:${username}`,
      server,
      username,
      playwrightProxy: { server, username, password },
      dailyDate: getMadridDateKey(),
      checksToday: 0,
      rejectedCount: 0,
      cooldownUntil: 0,
      lastUsedAt: 0,
    };
  }

  try {
    const parsed = new URL(
      cleaned.includes("://") ? cleaned : `http://${cleaned}`,
    );
    const port = parsed.port || "80";
    const server = `${parsed.protocol}//${parsed.hostname}:${port}`;
    const username = parsed.username
      ? decodeURIComponent(parsed.username)
      : null;
    const password = parsed.password
      ? decodeURIComponent(parsed.password)
      : undefined;

    return {
      id: username
        ? `${parsed.hostname}:${port}:${username}`
        : `${parsed.hostname}:${port}`,
      server,
      username,
      playwrightProxy: {
        server,
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
      },
      dailyDate: getMadridDateKey(),
      checksToday: 0,
      rejectedCount: 0,
      cooldownUntil: 0,
      lastUsedAt: 0,
    };
  } catch {
    return null;
  }
}

class ProxyService {
  private staticProxies: StaticProxyState[] = [];
  private cursor = 0;
  private lastUsedProxyId: string | null = null;
  private lastUsedExitIp: string | null = null;
  private residentialBaseUsername: string | null = null;
  private residentialSessionCounter = Math.floor(1000 + Math.random() * 8000);
  private readonly usedResidentialIds = new Set<string>();

  isEnabled(): boolean {
    return config.proxyMode !== "none";
  }

  async init(): Promise<void> {
    this.lastUsedProxyId = dbService.getLastUsedProxyId();
    this.lastUsedExitIp = dbService.getLastUsedExitIp();

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

      const cleanedBase = extractBaseUsername(
        config.webshareResidentialUsername,
      );
      if (cleanedBase !== config.webshareResidentialUsername.trim()) {
        console.log(
          `[Proxy] Normalized WEBSHARE_RESIDENTIAL_USERNAME "${config.webshareResidentialUsername}" -> base "${cleanedBase}".`,
        );
      }
      this.residentialBaseUsername = cleanedBase;

      console.log(
        `[Proxy] Residential sticky-session mode active (${config.webshareResidentialHost}:${config.webshareResidentialPort}, country=${config.webshareResidentialCountry}, lastExitIp=${this.lastUsedExitIp ?? "none"}).`,
      );
      return;
    }

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

    const today = getMadridDateKey();
    this.staticProxies = rawText
      .split(/\r?\n/)
      .map(parseProxyLine)
      .filter((p): p is StaticProxyState => p !== null)
      .map((proxy) => {
        const stored = dbService.getProxyRecord(proxy.id);
        if (!stored) return proxy;
        const parsedCooldown = stored.cooldownUntil
          ? Date.parse(stored.cooldownUntil)
          : 0;
        return {
          ...proxy,
          dailyDate: today,
          checksToday: stored.dailyDate === today ? stored.checksToday : 0,
          lastUsedAt: stored.lastUsedAt ? Date.parse(stored.lastUsedAt) : 0,
          cooldownUntil: Number.isFinite(parsedCooldown) ? parsedCooldown : 0,
        };
      });

    if (this.staticProxies.length === 0) {
      throw new Error("Webshare proxy list loaded 0 valid proxies.");
    }

    console.log(
      `[Proxy] Loaded ${this.staticProxies.length} Webshare proxies (lastUsed=${this.lastUsedProxyId ?? "none"}, lastExitIp=${this.lastUsedExitIp ?? "none"}).`,
    );
  }

  private resetStaleDailyCounters(): void {
    const today = getMadridDateKey();
    const now = Date.now();
    for (const proxy of this.staticProxies) {
      if (proxy.dailyDate !== today) {
        proxy.dailyDate = today;
        proxy.checksToday = 0;
        proxy.rejectedCount = 0;
        if (proxy.cooldownUntil <= now) {
          proxy.cooldownUntil = 0;
        }
      }
    }
  }

  validateExitIp(
    exitIp: string,
    mode: "list" | "residential",
  ): { allowed: true } | { allowed: false; reason: string } {
    const today = getMadridDateKey();
    const now = Date.now();
    const record = dbService.getExitIpRecord(exitIp);

    if (record?.cooldownUntil) {
      const cooldownMs = Date.parse(record.cooldownUntil);
      if (Number.isFinite(cooldownMs) && cooldownMs > now) {
        return {
          allowed: false,
          reason: `Exit IP ${exitIp} is cooling down until ${record.cooldownUntil} (${record.lastOutcome ?? "BLOCKED"})`,
        };
      }
    }

    if (
      config.maxChecksPerProxyPerDay > 0 &&
      record &&
      record.dailyDate === today &&
      record.checksToday >= config.maxChecksPerProxyPerDay
    ) {
      return {
        allowed: false,
        reason: `Exit IP ${exitIp} reached daily limit (${record.checksToday}/${config.maxChecksPerProxyPerDay})`,
      };
    }

    // Prevent back-to-back reuse of the exact same exit IP (except single-IP static list)
    const enforceDistinctIp =
      mode === "residential" || this.staticProxies.length > 1;
    if (enforceDistinctIp && exitIp === this.lastUsedExitIp) {
      return {
        allowed: false,
        reason: `Exit IP ${exitIp} matches immediately previous check IP`,
      };
    }

    return { allowed: true };
  }

  markExitIpSelected(exitIp: string, proxyId: string): void {
    this.lastUsedExitIp = exitIp;
    dbService.recordExitIpSelected(exitIp, proxyId, getMadridDateKey());
  }

  acquire(excludeIds: ReadonlySet<string> = new Set()): SelectedProxy | null {
    if (config.proxyMode === "none") return null;

    const today = getMadridDateKey();

    if (config.proxyMode === "residential") {
      const country = config.webshareResidentialCountry;
      const baseUser =
        this.residentialBaseUsername ??
        extractBaseUsername(config.webshareResidentialUsername ?? "");
      const server = `http://${config.webshareResidentialHost}:${config.webshareResidentialPort}`;

      let id = "";
      let username = "";
      do {
        this.residentialSessionCounter += 1;
        username = country
          ? `${baseUser}-${country}-${this.residentialSessionCounter}`
          : `${baseUser}-${this.residentialSessionCounter}`;
        id = `${config.webshareResidentialHost}:${config.webshareResidentialPort}:${username}`;
      } while (
        id === this.lastUsedProxyId ||
        excludeIds.has(id) ||
        this.usedResidentialIds.has(id)
      );

      this.usedResidentialIds.add(id);
      if (this.usedResidentialIds.size > 5000) {
        this.usedResidentialIds.clear();
        this.usedResidentialIds.add(id);
      }

      const selected: SelectedProxy = {
        id,
        label: `${server} (${username})`,
        mode: "residential",
        server,
        username,
        exitIp: null,
        playwrightProxy: {
          server,
          username,
          password: config.webshareResidentialPassword ?? undefined,
        },
      };

      this.lastUsedProxyId = selected.id;
      dbService.recordProxySelected(selected, today);
      return selected;
    }

    this.resetStaleDailyCounters();
    const now = Date.now();
    const total = this.staticProxies.length;

    const eligible = this.staticProxies
      .map((proxy, index) => ({ proxy, index }))
      .filter(({ proxy }) => {
        if (excludeIds.has(proxy.id)) return false;
        const underCap =
          config.maxChecksPerProxyPerDay === 0 ||
          proxy.checksToday < config.maxChecksPerProxyPerDay;
        return underCap && proxy.cooldownUntil <= now;
      });

    if (eligible.length === 0) return null;

    const distinct = eligible.filter(
      ({ proxy }) => proxy.id !== this.lastUsedProxyId,
    );

    if (distinct.length === 0 && (total > 1 || excludeIds.size > 0)) {
      console.warn(
        `[Proxy] Skipping ${this.lastUsedProxyId} to avoid back-to-back reuse.`,
      );
      return null;
    }

    const pool = distinct.length > 0 ? distinct : eligible;
    pool.sort((a, b) => a.proxy.lastUsedAt - b.proxy.lastUsedAt);

    const chosen = pool[0];
    if (!chosen) return null;

    chosen.proxy.lastUsedAt = now;
    this.cursor = (chosen.index + 1) % total;

    const selected: SelectedProxy = {
      id: chosen.proxy.id,
      label: `${chosen.proxy.server} (${chosen.proxy.username ?? "no-auth"} | ${chosen.proxy.checksToday + 1}/${config.maxChecksPerProxyPerDay})`,
      mode: "list",
      server: chosen.proxy.server,
      username: chosen.proxy.username,
      exitIp: null,
      playwrightProxy: chosen.proxy.playwrightProxy,
    };

    this.lastUsedProxyId = selected.id;
    dbService.recordProxySelected(selected, today);
    return selected;
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
    proxy: SelectedProxy | null,
    outcome: ProxyOutcome,
    errorReason?: string,
  ): void {
    if (!proxy) return;

    const today = getMadridDateKey();
    let proxyCooldownIso: string | null = null;

    if (config.proxyMode === "list") {
      const entry = this.staticProxies.find((p) => p.id === proxy.id);
      if (entry) {
        this.resetStaleDailyCounters();

        if (outcome === "SUCCESS") {
          entry.checksToday += 1;
          entry.rejectedCount = 0;
          entry.cooldownUntil = 0;
        } else if (outcome === "IP_BLOCKED") {
          entry.rejectedCount += 1;
          entry.cooldownUntil = Date.now() + DAILY_IP_BLOCK_COOLDOWN_MS;
          proxyCooldownIso = new Date(entry.cooldownUntil).toISOString();
          console.warn(
            `[Proxy] ${entry.id} (${proxy.exitIp ?? "unknown IP"}) hit "Información" daily IP block — 24h cooldown until ${proxyCooldownIso}.`,
          );
        } else {
          entry.rejectedCount += 1;
          const multiplier = Math.min(entry.rejectedCount, 4);
          entry.cooldownUntil = Date.now() + PROXY_COOLDOWN_MS * multiplier;
          proxyCooldownIso = new Date(entry.cooldownUntil).toISOString();
          console.warn(
            `[Proxy] ${entry.id} (${proxy.exitIp ?? "unknown IP"}) recorded ${outcome} (${errorReason ?? "no detail"}) — cooling down ${(PROXY_COOLDOWN_MS * multiplier) / 60_000} min.`,
          );
        }
      }
    } else if (outcome === "IP_BLOCKED") {
      proxyCooldownIso = new Date(
        Date.now() + DAILY_IP_BLOCK_COOLDOWN_MS,
      ).toISOString();
      console.warn(
        `[Proxy] Residential IP ${proxy.exitIp ?? proxy.id} hit "Información" daily IP block — 24h cooldown until ${proxyCooldownIso}.`,
      );
    } else if (outcome !== "SUCCESS") {
      proxyCooldownIso = new Date(Date.now() + PROXY_COOLDOWN_MS).toISOString();
    }

    dbService.recordProxyOutcome(
      proxy,
      outcome,
      today,
      errorReason,
      proxyCooldownIso,
    );

    // Record outcome & cooldown against the actual resolved exit IP
    if (proxy.exitIp) {
      let exitIpCooldownIso: string | null = null;

      if (outcome === "IP_BLOCKED") {
        exitIpCooldownIso = new Date(
          Date.now() + DAILY_IP_BLOCK_COOLDOWN_MS,
        ).toISOString();
      } else if (outcome !== "SUCCESS") {
        const existingIp = dbService.getExitIpRecord(proxy.exitIp);
        const multiplier = Math.min((existingIp?.errorCount ?? 0) + 1, 4);
        exitIpCooldownIso = new Date(
          Date.now() + PROXY_COOLDOWN_MS * multiplier,
        ).toISOString();
      }

      dbService.recordExitIpOutcome(
        proxy.exitIp,
        proxy.id,
        outcome,
        today,
        errorReason,
        exitIpCooldownIso,
      );
    }
  }
}

export const proxyService = new ProxyService();
