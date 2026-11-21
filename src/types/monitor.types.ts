export type CheckStatus =
  | "AVAILABLE"
  | "NO_SLOTS"
  | "SESSION_EXPIRED"
  | "REJECTED"
  | "IP_BLOCKED"
  | "UNKNOWN"
  | "ERROR";

export type ProxyOutcome = "SUCCESS" | "REJECTED" | "IP_BLOCKED" | "ERROR";

export interface ExitIpRecord {
  exitIp: string;
  lastProxyId: string | null;
  lastUsedAt: string | null;
  lastOutcome: ProxyOutcome | null;
  lastErrorAt: string | null;
  lastErrorReason: string | null;
  errorCount: number;
  dailyDate: string;
  checksToday: number;
  cooldownUntil: string | null;
}

export interface ProxyRecord {
  proxyId: string;
  mode: "list" | "residential";
  server: string;
  username: string | null;
  lastUsedAt: string | null;
  lastOutcome: ProxyOutcome | null;
  lastErrorAt: string | null;
  lastErrorReason: string | null;
  errorCount: number;
  dailyDate: string;
  checksToday: number;
  cooldownUntil: string | null;
}

export interface ProxyDevLogEntry {
  timestamp: string;
  mode: "none" | "list" | "residential";
  proxyId: string;
  server: string;
  username: string | null;
  exitIp: string | null;
  probeLatencyMs: number | null;
  portalTtfbMs: number | null;
  portalHttpStatus: number | null;
  totalDurationMs: number;
  outcome: ProxyOutcome;
  targetUrl: string;
  error?: string;
}

export type NonErrorCheckStatus = Exclude<CheckStatus, "ERROR">;

export interface SlotCheckResult {
  status: NonErrorCheckStatus;
  message: string;
  url: string;
  details?: string;
  screenshotPath?: string;
}

export interface CheckLogEntry {
  timestamp: string;
  checkNumber: number;
  status: NonErrorCheckStatus;
  durationMs: number;
  message: string;
  url: string;
  details?: string;
  screenshotPath?: string;
}

export interface ErrorReport {
  timestamp: string;
  checkNumber: number;
  name: string;
  message: string;
  stack: string | null;
  consecutiveFailures: number;
  durationMs: number;
  screenshotPath?: string | null;
}

export interface MonitorStats {
  startedAt: string;
  totalChecks: number;
  slotsAvailable: number;
  noSlots: number;
  sessionExpired: number;
  rejected: number;
  errors: number;
  consecutiveFailures: number;
  lastCheckAt: string | null;
  lastStatus: CheckStatus | null;
  unknown: number;
  dailyDate: string;
  checksToday: number;
  ipBlocked: number;
}
