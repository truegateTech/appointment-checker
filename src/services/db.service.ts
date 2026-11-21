import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Applicant, CreateApplicantInput } from "@/types/applicant.types";
import type {
  CheckStatus,
  ExitIpRecord,
  ProxyOutcome,
  ProxyRecord,
} from "@/types/monitor.types";

const DB_PATH = path.resolve("data/monitor.db");

interface ApplicantRow {
  id: number;
  full_name: string;
  nie: string;
  province_code: string;
  province_name: string;
  province_url: string;
  procedure_code: string;
  procedure_name: string;
  procedure_group: string;
  chat_id: string | null;
  is_active: number;
  last_status: CheckStatus | null;
  last_checked_at: string | null;
  created_at: string;
}

interface ProxyRecordRow {
  proxy_id: string;
  mode: "list" | "residential";
  server: string;
  username: string | null;
  last_used_at: string | null;
  last_outcome: ProxyOutcome | null;
  last_error_at: string | null;
  last_error_reason: string | null;
  error_count: number;
  daily_date: string;
  checks_today: number;
  cooldown_until: string | null;
}

interface ExitIpRecordRow {
  exit_ip: string;
  last_proxy_id: string | null;
  last_used_at: string | null;
  last_outcome: ProxyOutcome | null;
  last_error_at: string | null;
  last_error_reason: string | null;
  error_count: number;
  daily_date: string;
  checks_today: number;
  cooldown_until: string | null;
}

interface ProxyIdentity {
  id: string;
  mode: "list" | "residential";
  server: string;
  username: string | null;
}

function mapApplicantRow(row: ApplicantRow): Applicant {
  return {
    id: row.id,
    fullName: row.full_name,
    nie: row.nie,
    provinceCode: row.province_code,
    provinceName: row.province_name,
    provinceUrl: row.province_url,
    procedureCode: row.procedure_code,
    procedureName: row.procedure_name,
    procedureGroup: row.procedure_group,
    chatId: row.chat_id,
    isActive: row.is_active === 1,
    lastStatus: row.last_status,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  };
}

function mapProxyRow(row: ProxyRecordRow): ProxyRecord {
  return {
    proxyId: row.proxy_id,
    mode: row.mode,
    server: row.server,
    username: row.username,
    lastUsedAt: row.last_used_at,
    lastOutcome: row.last_outcome,
    lastErrorAt: row.last_error_at,
    lastErrorReason: row.last_error_reason,
    errorCount: row.error_count,
    dailyDate: row.daily_date,
    checksToday: row.checks_today,
    cooldownUntil: row.cooldown_until,
  };
}

function mapExitIpRow(row: ExitIpRecordRow): ExitIpRecord {
  return {
    exitIp: row.exit_ip,
    lastProxyId: row.last_proxy_id,
    lastUsedAt: row.last_used_at,
    lastOutcome: row.last_outcome,
    lastErrorAt: row.last_error_at,
    lastErrorReason: row.last_error_reason,
    errorCount: row.error_count,
    dailyDate: row.daily_date,
    checksToday: row.checks_today,
    cooldownUntil: row.cooldown_until,
  };
}

class DbService {
  private readonly db: Database.Database;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS applicants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        nie TEXT NOT NULL,
        province_code TEXT NOT NULL DEFAULT '8',
        province_name TEXT NOT NULL DEFAULT 'Barcelona',
        province_url TEXT NOT NULL DEFAULT 'https://icp.administracionelectronica.gob.es/icpplustieb/citar?p=8&locale=es',
        procedure_code TEXT NOT NULL DEFAULT '4010',
        procedure_name TEXT NOT NULL DEFAULT 'POLICIA-TOMA DE HUELLAS',
        procedure_group TEXT NOT NULL DEFAULT 'tramiteGrupo[0]',
        chat_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_status TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS proxy_records (
        proxy_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        server TEXT NOT NULL,
        username TEXT,
        last_used_at TEXT,
        last_outcome TEXT,
        last_error_at TEXT,
        last_error_reason TEXT,
        error_count INTEGER NOT NULL DEFAULT 0,
        daily_date TEXT NOT NULL,
        checks_today INTEGER NOT NULL DEFAULT 0,
        cooldown_until TEXT
      );

      CREATE TABLE IF NOT EXISTS exit_ip_records (
        exit_ip TEXT PRIMARY KEY,
        last_proxy_id TEXT,
        last_used_at TEXT,
        last_outcome TEXT,
        last_error_at TEXT,
        last_error_reason TEXT,
        error_count INTEGER NOT NULL DEFAULT 0,
        daily_date TEXT NOT NULL,
        checks_today INTEGER NOT NULL DEFAULT 0,
        cooldown_until TEXT
      );
    `);

    const applicantCols = this.db
      .prepare("PRAGMA table_info(applicants)")
      .all() as { name: string }[];
    const applicantColNames = new Set(applicantCols.map((c) => c.name));

    for (const obsoleteCol of ["nationality_code", "nationality_name"]) {
      if (applicantColNames.has(obsoleteCol)) {
        this.db.exec(`ALTER TABLE applicants DROP COLUMN ${obsoleteCol}`);
      }
    }

    const proxyCols = this.db
      .prepare("PRAGMA table_info(proxy_records)")
      .all() as { name: string }[];
    if (!proxyCols.some((c) => c.name === "cooldown_until")) {
      this.db.exec("ALTER TABLE proxy_records ADD COLUMN cooldown_until TEXT");
    }
  }

  // --- Applicants ---

  createApplicant(input: CreateApplicantInput): Applicant {
    const stmt = this.db.prepare(`
      INSERT INTO applicants (
        full_name, nie, province_code, province_name, province_url,
        procedure_code, procedure_name, procedure_group, chat_id, is_active
      )
      VALUES (
        @fullName, @nie, @provinceCode, @provinceName, @provinceUrl,
        @procedureCode, @procedureName, @procedureGroup, @chatId, 1
      )
      RETURNING *
    `);

    const row = stmt.get({
      fullName: input.fullName.trim().toUpperCase(),
      nie: input.nie.trim().toUpperCase(),
      provinceCode: input.provinceCode,
      provinceName: input.provinceName,
      provinceUrl: input.provinceUrl,
      procedureCode: input.procedureCode,
      procedureName: input.procedureName,
      procedureGroup: input.procedureGroup,
      chatId: input.chatId?.trim() || null,
    }) as ApplicantRow;

    return mapApplicantRow(row);
  }

  getActiveApplicants(): Applicant[] {
    const rows = this.db
      .prepare("SELECT * FROM applicants WHERE is_active = 1 ORDER BY id ASC")
      .all() as ApplicantRow[];
    return rows.map(mapApplicantRow);
  }

  getByChatId(chatId: string): Applicant[] {
    const rows = this.db
      .prepare("SELECT * FROM applicants WHERE chat_id = ? ORDER BY id DESC")
      .all(chatId) as ApplicantRow[];
    return rows.map(mapApplicantRow);
  }

  toggleById(id: number, chatId: string, isAdmin = false): Applicant | null {
    const row = isAdmin
      ? (this.db
          .prepare(
            `UPDATE applicants
             SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
             WHERE id = ?
             RETURNING *`,
          )
          .get(id) as ApplicantRow | undefined)
      : (this.db
          .prepare(
            `UPDATE applicants
             SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
             WHERE id = ? AND chat_id = ?
             RETURNING *`,
          )
          .get(id, chatId) as ApplicantRow | undefined);

    return row ? mapApplicantRow(row) : null;
  }

  setActiveById(id: number, active: boolean): void {
    this.db
      .prepare("UPDATE applicants SET is_active = ? WHERE id = ?")
      .run(active ? 1 : 0, id);
  }

  deleteById(id: number, chatId: string, isAdmin = false): boolean {
    const res = isAdmin
      ? this.db.prepare("DELETE FROM applicants WHERE id = ?").run(id)
      : this.db
          .prepare("DELETE FROM applicants WHERE id = ? AND chat_id = ?")
          .run(id, chatId);

    return res.changes > 0;
  }

  recordApplicantCheck(id: number, status: CheckStatus): void {
    this.db
      .prepare(
        "UPDATE applicants SET last_status = ?, last_checked_at = ? WHERE id = ?",
      )
      .run(status, new Date().toISOString(), id);
  }

  // --- Proxy Session Records ---

  recordProxySelected(proxy: ProxyIdentity, dailyDate: string): void {
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO proxy_records (
          proxy_id, mode, server, username, last_used_at, daily_date, checks_today
        )
        VALUES (@proxyId, @mode, @server, @username, @nowIso, @dailyDate, 0)
        ON CONFLICT(proxy_id) DO UPDATE SET
          mode = excluded.mode,
          server = excluded.server,
          username = excluded.username,
          last_used_at = excluded.last_used_at,
          checks_today = CASE
            WHEN proxy_records.daily_date = excluded.daily_date THEN proxy_records.checks_today
            ELSE 0
          END,
          daily_date = excluded.daily_date
      `,
      )
      .run({
        proxyId: proxy.id,
        mode: proxy.mode,
        server: proxy.server,
        username: proxy.username,
        nowIso,
        dailyDate,
      });
  }

  recordProxyOutcome(
    proxy: ProxyIdentity,
    outcome: ProxyOutcome,
    dailyDate: string,
    errorReason?: string,
    cooldownUntil?: string | null,
  ): void {
    const nowIso = new Date().toISOString();
    const isError = outcome !== "SUCCESS";

    this.db
      .prepare(
        `
        INSERT INTO proxy_records (
          proxy_id, mode, server, username, last_used_at, last_outcome,
          last_error_at, last_error_reason, error_count, daily_date, checks_today, cooldown_until
        )
        VALUES (
          @proxyId, @mode, @server, @username, @nowIso, @outcome,
          @lastErrorAt, @lastErrorReason, @initialErrorCount, @dailyDate, @initialChecks, @cooldownUntil
        )
        ON CONFLICT(proxy_id) DO UPDATE SET
          mode = excluded.mode,
          server = excluded.server,
          username = excluded.username,
          last_outcome = excluded.last_outcome,
          last_error_at = CASE
            WHEN @isError = 1 THEN @nowIso
            ELSE proxy_records.last_error_at
          END,
          last_error_reason = CASE
            WHEN @isError = 1 THEN @lastErrorReason
            ELSE proxy_records.last_error_reason
          END,
          error_count = CASE
            WHEN @isError = 1 THEN proxy_records.error_count + 1
            ELSE proxy_records.error_count
          END,
          checks_today = CASE
            WHEN proxy_records.daily_date = excluded.daily_date
              THEN proxy_records.checks_today + @initialChecks
            ELSE @initialChecks
          END,
          daily_date = excluded.daily_date,
          cooldown_until = @cooldownUntil
      `,
      )
      .run({
        proxyId: proxy.id,
        mode: proxy.mode,
        server: proxy.server,
        username: proxy.username,
        nowIso,
        outcome,
        isError: isError ? 1 : 0,
        lastErrorAt: isError ? nowIso : null,
        lastErrorReason: isError ? (errorReason ?? outcome) : null,
        initialErrorCount: isError ? 1 : 0,
        dailyDate,
        initialChecks: outcome === "SUCCESS" ? 1 : 0,
        cooldownUntil: cooldownUntil ?? null,
      });
  }

  getProxyRecord(proxyId: string): ProxyRecord | null {
    const row = this.db
      .prepare("SELECT * FROM proxy_records WHERE proxy_id = ?")
      .get(proxyId) as ProxyRecordRow | undefined;
    return row ? mapProxyRow(row) : null;
  }

  getLastUsedProxyId(): string | null {
    const row = this.db
      .prepare(
        "SELECT proxy_id FROM proxy_records WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC LIMIT 1",
      )
      .get() as { proxy_id: string } | undefined;
    return row?.proxy_id ?? null;
  }

  getProxyErrors(limit = 20): ProxyRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM proxy_records WHERE error_count > 0 ORDER BY last_error_at DESC LIMIT ?",
      )
      .all(limit) as ProxyRecordRow[];
    return rows.map(mapProxyRow);
  }

  // --- Resolved Exit IP Records ---

  recordExitIpSelected(
    exitIp: string,
    proxyId: string,
    dailyDate: string,
  ): void {
    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO exit_ip_records (
          exit_ip, last_proxy_id, last_used_at, daily_date, checks_today
        )
        VALUES (@exitIp, @proxyId, @nowIso, @dailyDate, 0)
        ON CONFLICT(exit_ip) DO UPDATE SET
          last_proxy_id = excluded.last_proxy_id,
          last_used_at = excluded.last_used_at,
          checks_today = CASE
            WHEN exit_ip_records.daily_date = excluded.daily_date THEN exit_ip_records.checks_today
            ELSE 0
          END,
          daily_date = excluded.daily_date
      `,
      )
      .run({ exitIp, proxyId, nowIso, dailyDate });
  }

  recordExitIpOutcome(
    exitIp: string,
    proxyId: string,
    outcome: ProxyOutcome,
    dailyDate: string,
    errorReason?: string,
    cooldownUntil?: string | null,
  ): void {
    const nowIso = new Date().toISOString();
    const isError = outcome !== "SUCCESS";

    this.db
      .prepare(
        `
        INSERT INTO exit_ip_records (
          exit_ip, last_proxy_id, last_used_at, last_outcome,
          last_error_at, last_error_reason, error_count, daily_date, checks_today, cooldown_until
        )
        VALUES (
          @exitIp, @proxyId, @nowIso, @outcome,
          @lastErrorAt, @lastErrorReason, @initialErrorCount, @dailyDate, @initialChecks, @cooldownUntil
        )
        ON CONFLICT(exit_ip) DO UPDATE SET
          last_proxy_id = excluded.last_proxy_id,
          last_outcome = excluded.last_outcome,
          last_error_at = CASE
            WHEN @isError = 1 THEN @nowIso
            ELSE exit_ip_records.last_error_at
          END,
          last_error_reason = CASE
            WHEN @isError = 1 THEN @lastErrorReason
            ELSE exit_ip_records.last_error_reason
          END,
          error_count = CASE
            WHEN @isError = 1 THEN exit_ip_records.error_count + 1
            ELSE exit_ip_records.error_count
          END,
          checks_today = CASE
            WHEN exit_ip_records.daily_date = excluded.daily_date
              THEN exit_ip_records.checks_today + @initialChecks
            ELSE @initialChecks
          END,
          daily_date = excluded.daily_date,
          cooldown_until = @cooldownUntil
      `,
      )
      .run({
        exitIp,
        proxyId,
        nowIso,
        outcome,
        isError: isError ? 1 : 0,
        lastErrorAt: isError ? nowIso : null,
        lastErrorReason: isError ? (errorReason ?? outcome) : null,
        initialErrorCount: isError ? 1 : 0,
        dailyDate,
        initialChecks: outcome === "SUCCESS" ? 1 : 0,
        cooldownUntil: cooldownUntil ?? null,
      });
  }

  getExitIpRecord(exitIp: string): ExitIpRecord | null {
    const row = this.db
      .prepare("SELECT * FROM exit_ip_records WHERE exit_ip = ?")
      .get(exitIp) as ExitIpRecordRow | undefined;
    return row ? mapExitIpRow(row) : null;
  }

  getLastUsedExitIp(): string | null {
    const row = this.db
      .prepare(
        "SELECT exit_ip FROM exit_ip_records WHERE last_used_at IS NOT NULL ORDER BY last_used_at DESC LIMIT 1",
      )
      .get() as { exit_ip: string } | undefined;
    return row?.exit_ip ?? null;
  }

  getExitIpErrors(limit = 20): ExitIpRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM exit_ip_records WHERE error_count > 0 ORDER BY last_error_at DESC LIMIT ?",
      )
      .all(limit) as ExitIpRecordRow[];
    return rows.map(mapExitIpRow);
  }

  close(): void {
    this.db.close();
  }
}

export const dbService = new DbService();
