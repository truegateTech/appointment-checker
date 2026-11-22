import fs from "node:fs";

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
console.log("Index of var enviar:", idx);
if (idx !== -1) {
  const scriptEnd = content.indexOf("</script>", idx);
  const snippet = content.slice(idx, scriptEnd);
  console.log("Length:", snippet.length);
  console.log(snippet.slice(0, 300));
}
