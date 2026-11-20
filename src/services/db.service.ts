import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Applicant, CreateApplicantInput } from "@/types/applicant.types";
import type { CheckStatus } from "@/types/monitor.types";

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

function mapRow(row: ApplicantRow): Applicant {
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
    `);

    const cols = this.db.prepare("PRAGMA table_info(applicants)").all() as {
      name: string;
    }[];
    const names = new Set(cols.map((c) => c.name));

    // Drop legacy nationality columns if upgrading an existing monitor.db
    for (const obsoleteCol of ["nationality_code", "nationality_name"]) {
      if (names.has(obsoleteCol)) {
        this.db.exec(`ALTER TABLE applicants DROP COLUMN ${obsoleteCol}`);
      }
    }
  }

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

    return mapRow(row);
  }

  getActiveApplicants(): Applicant[] {
    const rows = this.db
      .prepare("SELECT * FROM applicants WHERE is_active = 1 ORDER BY id ASC")
      .all() as ApplicantRow[];
    return rows.map(mapRow);
  }

  getByChatId(chatId: string): Applicant[] {
    const rows = this.db
      .prepare("SELECT * FROM applicants WHERE chat_id = ? ORDER BY id DESC")
      .all(chatId) as ApplicantRow[];
    return rows.map(mapRow);
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

    return row ? mapRow(row) : null;
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

  close(): void {
    this.db.close();
  }
}

export const dbService = new DbService();
