const fs = require('fs');
const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
let code = content.slice(idx, scriptEnd);

// Replace "var Zyt=THg(WBJ,pyL );Zyt(8908);"
code = code.replace("var Zyt=THg(WBJ,pyL );Zyt(8908);", "fs.writeFileSync('data/pyl_source.js', pyL); var Zyt=THg(WBJ,pyL); Zyt(8908);");

const vm = require('vm');
const sandbox = {
  fs,
  console,
  window: {},
  document: { forms: [{}] }
};
sandbox.window = sandbox;
vm.runInNewContext(code, sandbox);

console.log("Done. Check data/pyl_source.js");
const pyl = fs.readFileSync('data/pyl_source.js', 'utf8');
console.log('pyL size:', pyl.length);
console.log(pyl.slice(0, 1000));
