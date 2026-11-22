import fs from "node:fs";

const content = fs.readFileSync("data/cache-dump/43e59b8dab8e26b9_0.html", "utf8");
const m = content.match(/var enviar;\s*\(function\(\)\{([\s\S]*?)\}\)\(\);/i);
if (m) {
  const code = m[1];
  console.log("Extracted code length:", code.length);

  // We can hook Function constructor to capture what function is being compiled!
  const hooked = `
    const origFunc = Function;
    let compiledSource = [];
    global.Function = function(...args) {
      compiledSource.push(args[args.length - 1]);
      return origFunc(...args);
    };
    var enviar;
    (function(){
      ${code}
    })();
    console.log("Captured compiled functions (" + compiledSource.length + "):");
    compiledSource.forEach((src, i) => {
      console.log(\`=== FUNCTION \${i + 1} ===\`);
      console.log(src);
    });
    console.log("Resulting enviar function string:");
    console.log(enviar ? enviar.toString() : "undefined");
  `;
  try {
    eval(hooked);
  } catch (e: any) {
    console.error("Eval error:", e.message);
  }
}
