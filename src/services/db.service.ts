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
  nationality_code: string;
  procedure_code: string;
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
    nationalityCode: row.nationality_code,
    procedureCode: row.procedure_code,
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
    // WAL mode keeps reads/writes fast and safe when Telegram commands + poller run together
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS applicants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        nie TEXT NOT NULL UNIQUE,
        nationality_code TEXT NOT NULL,
        procedure_code TEXT NOT NULL DEFAULT '4010',
        chat_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_status TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  upsertApplicant(input: CreateApplicantInput): Applicant {
    const stmt = this.db.prepare(`
      INSERT INTO applicants (full_name, nie, nationality_code, procedure_code, chat_id, is_active)
      VALUES (@fullName, @nie, @nationalityCode, @procedureCode, @chatId, 1)
      ON CONFLICT(nie) DO UPDATE SET
        full_name = excluded.full_name,
        nationality_code = excluded.nationality_code,
        procedure_code = excluded.procedure_code,
        chat_id = COALESCE(excluded.chat_id, applicants.chat_id),
        is_active = 1
      RETURNING *
    `);

    const row = stmt.get({
      fullName: input.fullName.trim(),
      nie: input.nie.trim().toUpperCase(),
      nationalityCode: input.nationalityCode.trim(),
      procedureCode: input.procedureCode?.trim() || "4010",
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

  findByNameOrNie(query: string): Applicant | null {
    const q = query.trim();
    const row = this.db
      .prepare(
        `SELECT * FROM applicants
         WHERE UPPER(nie) = UPPER(?) OR LOWER(full_name) LIKE LOWER(?)
         LIMIT 1`,
      )
      .get(q, `%${q}%`) as ApplicantRow | undefined;
    return row ? mapRow(row) : null;
  }

  setActive(nie: string, active: boolean): boolean {
    const res = this.db
      .prepare(
        "UPDATE applicants SET is_active = ? WHERE UPPER(nie) = UPPER(?)",
      )
      .run(active ? 1 : 0, nie.trim());
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
