import fs from "node:fs";
import path from "node:path";

const content = fs.readFileSync("data/cache-dump/dabdc53d6bdf478b_0.html", "utf8");

// Extract form
const formMatch = content.match(/<form[\s\S]*?<\/form>/i);
if (formMatch) {
  const form = formMatch[0];
  const inputs = form.match(/<(?:input|select|button)[\s\S]*?>/gi) || [];
  for (const inp of inputs) {
    console.log(inp.slice(0, 150));
  }
}

// Extract select options for sede and tramite
const selects = content.match(/<select[\s\S]*?<\/select>/gi) || [];
for (const s of selects) {
  const name = (s.match(/name=["']([^"']+)["']/i) || [])[1];
  const id = (s.match(/id=["']([^"']+)["']/i) || [])[1];
  const options = (s.match(/<option[\s\S]*?<\/option>/gi) || []).map(o => o.replace(/<[^>]+>/g, "").trim());
  console.log(`\nSelect: id=${id} name=${name} (${options.length} options):`);
  console.log(options.slice(0, 15));
}
