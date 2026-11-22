import fs from "node:fs";

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
const code = content.slice(idx, scriptEnd);

console.log("Full script:\n" + code);
