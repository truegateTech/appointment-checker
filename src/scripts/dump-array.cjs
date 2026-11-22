const vm = require('vm');
const fs = require('fs');

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
let code = content.slice(idx, scriptEnd);

// Expose the array inside the closure: replace "var _$_e23e=" with "global._$_e23e="
code = code.replace(/var (_0x[a-f0-9]+|_0x[a-zA-Z0-9]+|_\$_[a-zA-Z0-9]+)=/g, "global.$1=");

const sandbox = {
  console: console,
  window: {},
  navigator: {},
  document: { forms: [{}] }
};
sandbox.window = sandbox;
sandbox.global = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(code, context);

for (const k of Object.keys(context)) {
  if (Array.isArray(context[k])) {
    console.log(`Array [${k}]:`, context[k]);
  }
}
