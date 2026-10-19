const fs=require('fs'),assert=require('assert'),path=require('path');
const adr=fs.readFileSync(path.join(__dirname,'../docs/ADR-0001-browser-runtime.md'),'utf8');
for(const term of ['Secure managed browser runtime','Chromium C++ fork','upstream','profile isolation',
  'OS-backed encrypted vault','Local API','MCC/OAuth','Known limitations']){
  assert(adr.includes(term),'Architecture ADR missing: '+term);
}
assert(adr.includes('does **not** currently include a self-built Chromium'));
assert(adr.includes('do not guarantee identity unlinkability') || adr.includes('does not guarantee identity unlinkability'));
console.log('Browser runtime ADR boundaries and acceptance gates verified');
