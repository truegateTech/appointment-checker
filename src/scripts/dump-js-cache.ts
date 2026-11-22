import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("user-data/user-data/Default/Cache/Cache_Data");
const DUMP_DIR = path.resolve("data/cache-dump/js");
fs.mkdirSync(DUMP_DIR, { recursive: true });

const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith("_0"));
console.log(`Scanning cache for JS files...`);

const jsFiles: { file: string; url: string; size: number }[] = [];

for (const file of files) {
  const buf = fs.readFileSync(path.join(CACHE_DIR, file));
  const text = buf.toString("latin1");

  const isJs = text.includes("Content-Type: text/javascript") || text.includes("content-type:text/javascript");
  if (isJs) {
    const matches = text.match(/https?:\/\/[^\x00\r\n\s"'<>]+/g) || [];
    let fullUrl = matches.length > 0 ? matches[matches.length - 1] : "(unknown)";
    jsFiles.push({ file, url: fullUrl, size: buf.length });

    // Save JS payload
    // Find where headers end: \r\n\r\n or \0\0
    const httpIdx = text.indexOf("HTTP/1.");
    let jsStart = 24;
    if (httpIdx !== -1) {
      const headerEnd = text.indexOf("\r\n\r\n", httpIdx);
      if (headerEnd !== -1) {
        jsStart = headerEnd + 4;
      }
    }
    fs.writeFileSync(path.join(DUMP_DIR, `${file}.js`), buf.subarray(jsStart));
  }
}

console.log(`Extracted ${jsFiles.length} JS files:`);
for (const j of jsFiles) {
  console.log(`- ${j.file} (${j.size} B): ${j.url}`);
}
