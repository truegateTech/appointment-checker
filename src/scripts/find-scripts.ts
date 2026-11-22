import fs from "node:fs";
import path from "node:path";

const DUMP_DIR = path.resolve("data/cache-dump");
const files = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith(".html"));

console.log("=== SCRIPT TAGS IN CACHED HTML PAGES ===");

const allScripts = new Set<string>();

for (const f of files) {
  const content = fs.readFileSync(path.join(DUMP_DIR, f), "utf8");
  console.log(`\nPage: ${f}`);
  const scriptMatches = content.match(/<script[\s\S]*?<\/script>/gi) || [];
  for (const s of scriptMatches) {
    const srcMatch = s.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      console.log(`  SRC: ${srcMatch[1]}`);
      allScripts.add(srcMatch[1]);
    } else {
      // inline script preview
      const inline = s.replace(/<script[^>]*>|<\/script>/gi, "").trim();
      if (inline.length > 0) {
        console.log(`  INLINE (${inline.length} chars): ${inline.slice(0, 100).replace(/\s+/g, " ")}...`);
      }
    }
  }
}

console.log("\nUnique script sources across all pages:", Array.from(allScripts));
