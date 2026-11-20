export type CheckStatus =
  | "AVAILABLE"
  | "NO_SLOTS"
  | "SESSION_EXPIRED"
  | "REJECTED"
  | "ERROR";

export interface SlotCheckResult {
  status: Exclude<CheckStatus, "ERROR">;
  message: string;
  url: string;
  details?: string;
  screenshotPath?: string;
}

export interface CheckLogEntry {
  timestamp: string;
  checkNumber: number;
  status: Exclude<CheckStatus, "ERROR">;
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
}
