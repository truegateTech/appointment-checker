const vm = require('vm');
const fs = require('fs');

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
const code = content.slice(idx, scriptEnd);

const accessed = [];

const fakeForm = {
  name: 'procedimientos',
  action: 'salirInicio',
  elements: {},
  submit: () => {
    accessed.push('[Form.submit] submitted to action: ' + fakeForm.action);
    console.log('[Form.submit] submitted to action:', fakeForm.action);
  }
};

const elementsMap = {};

function getElem(idOrName) {
  if (!elementsMap[idOrName]) {
    elementsMap[idOrName] = {
      id: idOrName,
      name: idOrName,
      value: '',
      style: {},
      setAttribute: (k, v) => {
        accessed.push(`[Element(${idOrName}).setAttribute] ${k}=${v}`);
      }
    };
  }
  return elementsMap[idOrName];
}

const sandbox = {
  console: console,
  window: {},
  navigator: {
    webdriver: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  document: {
    forms: [fakeForm],
    procedimientos: fakeForm,
    getElementById: (id) => {
      accessed.push('[document.getElementById] ' + id);
      return getElem(id);
    },
    getElementsByName: (name) => {
      accessed.push('[document.getElementsByName] ' + name);
      return [getElem(name)];
    }
  }
};
sandbox.window = sandbox;

const context = vm.createContext(sandbox);
vm.runInContext(code, context);

console.log('--- CALLING enviar("btnEnviar") ---');
try {
  context.enviar("btnEnviar");
} catch (e) {
  console.log('enviar error:', e.message);
}

console.log('\n--- ALL ACCESSED OPERATIONS ---');
console.log(accessed);

console.log('\n--- ELEMENTS ACCESSED/MODIFIED ---');
for (const [k, v] of Object.entries(elementsMap)) {
  console.log(`Element [${k}]:`, v);
}
console.log('Fake form state:', fakeForm);
