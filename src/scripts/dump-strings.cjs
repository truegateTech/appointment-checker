const vm = require('vm');
const fs = require('fs');

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
const code = content.slice(idx, scriptEnd);

const sandbox = {
  console: console,
  window: {},
  document: {
    forms: [{ action: '', elements: {}, submit: () => console.log('SUBMIT CALLED') }],
    getElementById: (id) => ({ value: '', style: {} }),
    getElementsByName: (name) => [{ value: '', style: {} }]
  }
};
sandbox.window = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(code, context);

for (const key of Object.keys(context)) {
  if (key.startsWith('_$_') || key.startsWith('jso$')) {
    console.log(`Context key [${key}]:`, context[key]);
  }
}
