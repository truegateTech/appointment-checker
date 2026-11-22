const fs = require('fs');
const pyl = fs.readFileSync('data/pyl_source.js', 'utf8');
const vm = require('vm');
const sandbox = {
  document: { forms: [{}] },
  navigator: {},
  String: String,
  out: {}
};
sandbox.window = sandbox;
sandbox.global = sandbox;

vm.runInNewContext(pyl + '; out.arr = _$_e23e;', sandbox);
console.log('Decrypted _$_e23e strings:');
sandbox.out.arr.forEach((str, i) => {
  console.log(`[${i}] = "${str}"`);
});
