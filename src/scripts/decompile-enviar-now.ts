import fs from "node:fs";

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const idx = content.indexOf("var enviar;");
const scriptEnd = content.indexOf("</script>", idx);
const code = content.slice(idx, scriptEnd);

// Let's run it inside a mock browser environment so document/window references don't crash
const mockEnv = `
  const fakeForm = {
    elements: {},
    action: "",
    submit: () => console.log("[Mock] Form submitted!"),
  };
  global.window = {
    document: {
      forms: [fakeForm],
      getElementById: (id) => ({ value: "", style: {}, setAttribute: () => {} }),
      getElementsByName: (n) => [{ value: "", style: {} }],
    },
    location: { href: "https://icp.administracionelectronica.gob.es/icpplustieb/acValidarEntrada" },
  };
  global.document = global.window.document;
  global.$ = () => ({ val: () => "", click: () => {}, on: () => {} });

  const origFn = Function;
  global.Function = function(...args) {
    console.log("=== COMPILING DYNAMIC FUNCTION ===");
    console.log(args[args.length - 1]);
    return origFn(...args);
  };

  ${code}

  console.log("=== FINAL ENVIAR FUNCTION ===");
  if (typeof enviar !== 'undefined') {
    console.log(enviar.toString());
  } else {
    console.log("enviar is undefined");
  }
`;

try {
  eval(mockEnv);
} catch (e: any) {
  console.error("Error executing:", e);
}
