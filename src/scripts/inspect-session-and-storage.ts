import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const BASE_DIR = path.resolve("user-data");

console.log("=== TARGETED INSPECTION ===");

// 1. History urls in user-data\user-data\Default\History
const histDb = new Database(path.join(BASE_DIR, "user-data", "Default", "History"), { readonly: true });
console.log("\n--- USER-DATA/USER-DATA HISTORY URLS ---");
const urls = histDb.prepare("SELECT id, url, title, visit_count, typed_count, last_visit_time FROM urls").all();
console.table(urls);

console.log("\n--- VISITS ---");
const visits = histDb.prepare("SELECT id, url, visit_time, from_visit, transition FROM visits").all();
console.table(visits);

// 2. Autofill in Web Data
const webDataDb = new Database(path.join(BASE_DIR, "user-data", "Default", "Web Data"), { readonly: true });
console.log("\n--- AUTOFILL IN WEB DATA ---");
try {
  const autofill = webDataDb.prepare("SELECT * FROM autofill").all();
  console.log("autofill entries:", autofill);
} catch (e: any) {
  console.log("autofill table error:", e.message);
}
try {
  const profiles = webDataDb.prepare("SELECT * FROM autofill_profiles").all();
  console.log("autofill_profiles:", profiles);
} catch (e: any) {
  console.log("autofill_profiles error:", e.message);
}

// 3. Network Persistent State
console.log("\n--- NETWORK PERSISTENT STATE ---");
for (const p of [
  path.join(BASE_DIR, "Default", "Network Persistent State"),
  path.join(BASE_DIR, "user-data", "Default", "Network Persistent State"),
]) {
  if (fs.existsSync(p)) {
    console.log(`\nPath: ${p}`);
    const content = JSON.parse(fs.readFileSync(p, "utf8"));
    console.log("Servers / Alt-Svc / Network isolation:", JSON.stringify(content.net?.http_server_properties ?? content, null, 2));
  }
}

// 4. LocalStorage & SessionStorage leveldb dump
console.log("\n--- LEVELDB / STORAGE SCAN ---");
function scanStorageDir(dir: string, label: string) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  console.log(`\nScanning ${label} (${dir}): files = ${files.join(", ")}`);
  for (const f of files) {
    if (f.endsWith(".log") || f.endsWith(".ldb")) {
      const buf = fs.readFileSync(path.join(dir, f));
      // Extract printable strings >= 4 chars
      const text = buf.toString("latin1");
      const matches = text.match(/[A-Za-z0-9_.:/?&=%#\-+@]{4,}/g) ?? [];
      const relevant = matches.filter((m) =>
        /icp|gob|administracion|cita|nie|tie|token|session|cookie|user|key/i.test(m)
      );
      if (relevant.length > 0) {
        console.log(`  File ${f} relevant matches (${relevant.length}):`);
        console.log(`   `, Array.from(new Set(relevant)).slice(0, 30));
      }
    }
  }
}

scanStorageDir(path.join(BASE_DIR, "user-data", "Default", "Local Storage", "leveldb"), "user-data/user-data Local Storage");
scanStorageDir(path.join(BASE_DIR, "user-data", "Default", "Session Storage"), "user-data/user-data Session Storage");
scanStorageDir(path.join(BASE_DIR, "Default", "Local Storage", "leveldb"), "user-data Local Storage");
scanStorageDir(path.join(BASE_DIR, "Default", "Session Storage"), "user-data Session Storage");

// 5. Session restore files
console.log("\n--- SESSIONS DIRECTORY ---");
for (const sDir of [
  path.join(BASE_DIR, "user-data", "Default", "Sessions"),
  path.join(BASE_DIR, "Default", "Sessions"),
]) {
  if (fs.existsSync(sDir)) {
    const files = fs.readdirSync(sDir);
    console.log(`Sessions dir ${sDir}:`, files);
    for (const f of files) {
      const fPath = path.join(sDir, f);
      const buf = fs.readFileSync(fPath);
      console.log(`  ${f}: ${buf.length} bytes, header: ${buf.subarray(0, 8).toString("ascii")}`);
      // Find strings
      const str = buf.toString("latin1");
      const urlsInSession = str.match(/https?:\/\/[^\x00-\x1f\x7f-\xff"'\s<>]+/g) ?? [];
      if (urlsInSession.length > 0) {
        console.log(`  Found URLs in ${f}:`, Array.from(new Set(urlsInSession)));
      }
    }
  }
}
