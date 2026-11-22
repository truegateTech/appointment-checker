import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve("user-data/user-data/Default/Cache/Cache_Data");
const DUMP_DIR = path.resolve("data/cache-dump");
fs.mkdirSync(DUMP_DIR, { recursive: true });

const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith("_0"));

const htmlFiles: { file: string; url: string; size: number }[] = [];

for (const file of files) {
  const buf = fs.readFileSync(path.join(CACHE_DIR, file));
  const text = buf.toString("latin1");

  // Search for https://icp.administracionelectronica.gob.es
  const matches = text.match(/https?:\/\/icp\.administracionelectronica\.gob\.es[^\x00\r\n\s"'<>]+/g);
  let fullUrl = matches ? matches[matches.length - 1] : "";

  const isHtml = text.includes("Content-Type: text/html");
  if (isHtml) {
    htmlFiles.push({ file, url: fullUrl, size: buf.length });
    // Find where HTML payload starts: <!DOCTYPE or <html
    const htmlStart = text.indexOf("<!DOCTYPE") !== -1 ? text.indexOf("<!DOCTYPE") : text.indexOf("<html");
    if (htmlStart !== -1) {
      // Find where HTML ends: </html>
      const htmlEnd = text.indexOf("</html>");
      const htmlContent = htmlEnd !== -1 ? text.slice(htmlStart, htmlEnd + 7) : text.slice(htmlStart);
      fs.writeFileSync(path.join(DUMP_DIR, `${file}.html`), htmlContent, "utf8");
    }
  }
}

console.log(`Extracted ${htmlFiles.length} HTML files from cache:`);
for (const h of htmlFiles) {
  console.log(`- ${h.file} (${h.size} B): URL = ${h.url}`);
}
