import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("user-data/user-data/Default/Cache/Cache_Data");

console.log("=== CHROMIUM SIMPLE CACHE EXTRACTOR ===");

if (!fs.existsSync(CACHE_DIR)) {
  console.log("Cache dir not found.");
  process.exit(0);
}

const files = fs.readdirSync(CACHE_DIR);
console.log(`Found ${files.length} files in cache.`);

interface CacheItem {
  filename: string;
  size: number;
  url: string;
  headers: string[];
  bodyPreview: string;
}

const entries: CacheItem[] = [];

for (const file of files) {
  if (file === "index" || file === "index-dir") continue;
  const filePath = path.join(CACHE_DIR, file);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;
    const buf = fs.readFileSync(filePath);

    // Simple cache format:
    // EOF record at the end contains key (URL) length and flags.
    // Or we can search for http:// or https:// in the buffer, especially near the end.
    // In Simple Cache stream 0: [payload 0/1] [http header] [EOF 0] [key] [EOF 1]
    const text = buf.toString("latin1");

    // Look for URL pattern: 1/0/https://... or just https?://
    const urlMatches = text.match(/(?:1\/0\/)?(https?:\/\/[^\x00\r\n]+)/g);
    let url = "(unknown)";
    if (urlMatches && urlMatches.length > 0) {
      // Pick the last matching URL which is usually the key
      const raw = urlMatches[urlMatches.length - 1];
      url = raw.replace(/^1\/0\//, "");
      // Clean trailing non-printable characters
      const nullIdx = url.indexOf("\0");
      if (nullIdx !== -1) url = url.slice(0, nullIdx);
    }

    // Look for HTTP headers (HTTP/1.1 200 OK, etc.)
    const httpIdx = text.indexOf("HTTP/1.");
    let headerLines: string[] = [];
    if (httpIdx !== -1) {
      const headerSection = text.slice(httpIdx, httpIdx + 2000);
      const endHeaders = headerSection.indexOf("\0\0");
      const cleanHeaders = endHeaders !== -1 ? headerSection.slice(0, endHeaders) : headerSection.slice(0, 500);
      headerLines = cleanHeaders.split("\0").filter(h => h.trim().length > 0);
    }

    entries.push({
      filename: file,
      size: stat.size,
      url,
      headers: headerLines.slice(0, 10),
      bodyPreview: text.slice(0, 200).replace(/[^\x20-\x7e]/g, "."),
    });
  } catch (err: any) {
    // ignore read error
  }
}

console.log(`\nSuccessfully processed ${entries.length} cache entries.\n`);

// Group by domain
const byDomain = new Map<string, CacheItem[]>();
for (const e of entries) {
  try {
    const u = new URL(e.url);
    const domain = u.hostname;
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push(e);
  } catch {
    if (!byDomain.has("other")) byDomain.set("other", []);
    byDomain.get("other")!.push(e);
  }
}

for (const [domain, list] of byDomain.entries()) {
  console.log(`\n================ DOMAIN: ${domain} (${list.length} cached resources) ================`);
  for (const item of list) {
    console.log(`- [${item.size} B] ${item.url}`);
    if (item.headers.length > 0) {
      console.log(`    Headers: ${item.headers.slice(0, 4).join(" | ")}`);
    }
  }
}
