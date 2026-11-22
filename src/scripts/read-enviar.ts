import fs from "node:fs";

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const m = content.match(/var enviar;[\s\S]*?<\/script>/i);
if (m) {
  console.log("=== OBFUSCATED ENVIAR FUNCTION ===");
  console.log(m[0].slice(0, 1500));
}
