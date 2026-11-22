import fs from "node:fs";
import path from "node:path";

const DUMP_DIR = path.resolve("data/cache-dump");
const files = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith(".html"));

console.log("=== ANALYZING EXTRACTED HTML PAGES ===");

for (const f of files) {
  const content = fs.readFileSync(path.join(DUMP_DIR, f), "utf8");
  console.log(`\n======================================================`);
  console.log(`PAGE: ${f} (${content.length} bytes)`);

  // Extract <title>
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  console.log(`Title: ${titleMatch ? titleMatch[1].trim() : "(none)"}`);

  // Extract forms and their action, method, inputs
  const forms = content.match(/<form[\s\S]*?<\/form>/gi) || [];
  console.log(`Forms found: ${forms.length}`);
  forms.forEach((form, idx) => {
    const actionMatch = form.match(/action=["']([^"']+)["']/i);
    const methodMatch = form.match(/method=["']([^"']+)["']/i);
    console.log(`  Form #${idx + 1}: method=${methodMatch ? methodMatch[1] : "GET"} action=${actionMatch ? actionMatch[1] : ""}`);

    // Extract all <input>, <select>, <button>
    const inputs = form.match(/<(?:input|select|button)[\s\S]*?>/gi) || [];
    for (const inp of inputs) {
      const name = (inp.match(/name=["']([^"']+)["']/i) || [])[1] || "";
      const type = (inp.match(/type=["']([^"']+)["']/i) || [])[1] || "text";
      const value = (inp.match(/value=["']([^"']*)["']/i) || [])[1] || "";
      const id = (inp.match(/id=["']([^"']+)["']/i) || [])[1] || "";
      console.log(`    Input: id=${id} name=${name} type=${type} value="${value.slice(0, 50)}"`);
    }
  });

  // Check for alert or warning messages
  const alerts = content.match(/<p[^>]*class=["'][^"']*(?:error|alerta|mensaje|aviso)[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi) ||
                 content.match(/<div[^>]*class=["'][^"']*(?:error|alerta|mensaje|aviso)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi) || [];
  if (alerts.length > 0) {
    console.log(`  Alert / Message blocks:`);
    for (const a of alerts) {
      console.log(`    - ${a.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`);
    }
  }

  // Check for any text mentioning "cita" or "no hay"
  const citaSnippets = content.match(/([^.<>]{1,50}(?:no hay citas|cita previa|en este momento)[^.<>]{1,50})/gi);
  if (citaSnippets) {
    console.log(`  Cita snippets:`, citaSnippets.map(s => s.trim()));
  }
}
