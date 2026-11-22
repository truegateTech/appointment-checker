import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_DIR = path.resolve("user-data");

console.log("=== DEEP USER-DATA DIRECTORY INSPECTION ===");

function inspectDb(filePath: string) {
  console.log(`\n----------------------------------------`);
  console.log(`DATABASE: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.log("File does not exist.");
    return;
  }
  try {
    const db = new Database(filePath, { readonly: true });
    const tables = db
      .prepare(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string; type: string }[];

    console.log(
      `Tables (${tables.length}):`,
      tables.map((t) => t.name).join(", "),
    );

    for (const t of tables) {
      try {
        const countRow = db
          .prepare(`SELECT count(*) as c FROM "${t.name}"`)
          .get() as { c: number };
        if (countRow.c > 0) {
          console.log(`  Table [${t.name}] has ${countRow.c} row(s)`);
          const sample = db.prepare(`SELECT * FROM "${t.name}" LIMIT 10`).all();
          for (const row of sample) {
            // sanitize blobs
            const cleanRow: Record<string, any> = {};
            // @ts-expect-error
            for (const [k, v] of Object.entries(row)) {
              if (Buffer.isBuffer(v)) {
                cleanRow[k] =
                  `<Buffer len=${v.length} hex=${v.subarray(0, 16).toString("hex")}...>`;
              } else {
                cleanRow[k] = v;
              }
            }
            console.log(`    ROW:`, JSON.stringify(cleanRow));
          }
        }
      } catch (err: any) {
        console.log(`  Table [${t.name}] read error: ${err.message}`);
      }
    }
    db.close();
  } catch (e: any) {
    console.log(`Could not open db: ${e.message}`);
  }
}

// Inspect databases in user-data\Default
inspectDb(path.join(BASE_DIR, "Default", "History"));
inspectDb(path.join(BASE_DIR, "Default", "Network", "Cookies"));
inspectDb(path.join(BASE_DIR, "Default", "Web Data"));
inspectDb(path.join(BASE_DIR, "Default", "Login Data"));
inspectDb(path.join(BASE_DIR, "Default", "Favicons"));
inspectDb(path.join(BASE_DIR, "Default", "Shortcuts"));

// Inspect databases in user-data\user-data\Default
inspectDb(path.join(BASE_DIR, "user-data", "Default", "History"));
inspectDb(path.join(BASE_DIR, "user-data", "Default", "Cookies"));
inspectDb(path.join(BASE_DIR, "user-data", "Default", "Web Data"));
inspectDb(path.join(BASE_DIR, "user-data", "Default", "Login Data"));
inspectDb(path.join(BASE_DIR, "user-data", "Default", "Favicons"));
inspectDb(path.join(BASE_DIR, "user-data", "Default", "Shortcuts"));
