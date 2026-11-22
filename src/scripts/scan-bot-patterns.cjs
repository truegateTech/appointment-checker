const fs = require('fs');
const path = require('path');

const dir = 'data/cache-dump';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  console.log(`\n=== Scanning ${f} ===`);

  // Check for obfuscated function patterns
  const matches = content.match(/function\s+[a-zA-Z0-9_$]+\s*\([^)]*\)\s*\{[^}]*charAt[^}]*charCodeAt[\s\S]*?\}/g) || [];
  console.log(`Found ${matches.length} obfuscated charAt/charCodeAt patterns.`);

  // Check for mentions of webdriver, cdc_, phantom, etc.
  const botTerms = ['webdriver', 'cdc_', 'callPhantom', '_phantom', '__nightmare', 'domAutomation', 'acCitar', 'acCitarB'];
  for (const term of botTerms) {
    if (content.includes(term)) {
      console.log(`  Mentions "${term}"`);
    }
  }
}
