import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_DIR = path.resolve("user-data");

console.log("=== CLEAN STORAGE & SESSION INSPECTOR ===");

// 1. Web Data autofill
try {
  const webDataDb = new Database(path.join(BASE_DIR, "user-data", "Default", "Web Data"), { readonly: true });
  const rows = webDataDb.prepare("SELECT * FROM autofill").all();
  console.log("Web Data autofill rows:", JSON.stringify(rows));
  const autofill_sync = webDataDb.prepare("SELECT name, value FROM autofill").all();
  console.log("Autofill entries:", autofill_sync);
  webDataDb.close();
} catch (e: any) {
  console.log("Web Data read error:", e.message);
}

// 2. Network Persistent State
try {
  const netPath = path.join(BASE_DIR, "user-data", "Default", "Network Persistent State");
  if (fs.existsSync(netPath)) {
    const netJson = JSON.parse(fs.readFileSync(netPath, "utf8"));
    console.log("Network Persistent State (user-data/user-data):", JSON.stringify(netJson, null, 2));
  }
} catch (e: any) {
  console.log("Net persistent state err:", e.message);
}

// 3. LevelDB Local Storage
const ldbDir = path.join(BASE_DIR, "user-data", "Default", "Local Storage", "leveldb");
if (fs.existsSync(ldbDir)) {
  console.log("Local Storage LevelDB files:", fs.readdirSync(ldbDir));
  for (const f of fs.readdirSync(ldbDir)) {
    if (f.endsWith(".log") || f.endsWith(".ldb")) {
      const buf = fs.readFileSync(path.join(ldbDir, f));
      // Extract clean strings
      const strings = buf.toString("utf8").replace(/[^\x20-\x7e\n\r\t]/g, " ");
      const words = strings.split(/\s+/).filter(w => w.length > 5);
      console.log(`Words in ${f} (sample):`, words.slice(0, 50));
    }
  }
}

// 4. Session files
const sessDir = path.join(BASE_DIR, "user-data", "Default", "Sessions");
if (fs.existsSync(sessDir)) {
  for (const f of fs.readdirSync(sessDir)) {
    const buf = fs.readFileSync(path.join(sessDir, f));
    const strings = buf.toString("utf8").replace(/[^\x20-\x7e\n\r\t]/g, " ");
    const urls = strings.match(/https?:\/\/[^\s"'<>]+/g) || [];
    console.log(`Session file ${f} URLs:`, Array.from(new Set(urls)));
  }
}
