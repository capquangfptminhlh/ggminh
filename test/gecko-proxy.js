const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { updateGeckoProxy, preferencesFor, BEGIN, END } = require('../src/engine/geckoProxy');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'lhm-gecko-proxy-'));
try {
  const file = path.join(dir,'user.js');
  fs.writeFileSync(file,'user_pref("browser.startup.homepage", "https://example.org");\n');
  let state = updateGeckoProxy(dir,{type:'http',host:'proxy.example',port:8080});
  assert.strictEqual(state.type,'http');
  let value = fs.readFileSync(file,'utf8');
  assert(value.includes('user_pref("network.proxy.http", "proxy.example");'));
  assert(value.includes('user_pref("network.proxy.ssl_port", 8080);'));
  assert(value.includes('user_pref("browser.startup.homepage", "https://example.org");'));
  assert.strictEqual(value.split(BEGIN).length,2);
  updateGeckoProxy(dir,{type:'socks5',host:'socks.example',port:1080});
  value = fs.readFileSync(file,'utf8');
  assert(!value.includes('proxy.example'));
  assert(value.includes('user_pref("network.proxy.socks_remote_dns", true);'));
  assert(value.includes('user_pref("network.proxy.socks_version", 5);'));
  assert.strictEqual(value.split(END).length,2);
  updateGeckoProxy(dir,{type:'direct'});
  value = fs.readFileSync(file,'utf8');
  assert(value.includes('user_pref("network.proxy.type", 0);'));
  assert(!value.includes('socks.example'));
  assert(value.includes('browser.startup.homepage'));
  assert.throws(()=>updateGeckoProxy(dir,{type:'http',host:'https://evil',port:80}),/không hợp lệ/);
  assert.throws(()=>preferencesFor({type:'socks5',host:'proxy.example',port:8080,user:'secret'}),/mật khẩu/);
  const firefoxArgs=createLaunchArgs({engine:'gecko',profileDir:dir,url:'https://example.org',
    proxy:{type:'http',host:'proxy.example',port:8080}});
  assert(firefoxArgs.includes('--profile'));
  assert(!firefoxArgs.some(x=>x.includes('proxy.example')));
  // A stale or foreign temporary file is never ours to remove or overwrite.
  const beforeCollision=fs.readFileSync(file,'utf8');
  const collision=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(collision,'preserve existing temporary data');
  assert.throws(()=>updateGeckoProxy(dir,{type:'direct'}),/EEXIST/);
  assert.strictEqual(fs.readFileSync(file,'utf8'),beforeCollision);
  assert.strictEqual(fs.readFileSync(collision,'utf8'),'preserve existing temporary data');
  fs.unlinkSync(collision);
  const writeFile=fs.writeFileSync;
  try {
    fs.writeFileSync=(target,...args)=>{if(typeof target==='number')throw Error('simulated preference write failure');return writeFile(target,...args)};
    assert.throws(()=>updateGeckoProxy(dir,{type:'direct'}),/simulated preference write failure/);
  } finally { fs.writeFileSync=writeFile; }
  assert.strictEqual(fs.readFileSync(file,'utf8'),beforeCollision);
  assert.strictEqual(fs.existsSync(collision),false);
  const rename=fs.renameSync;
  try {
    fs.renameSync=()=>{throw Error('simulated preference rename failure')};
    assert.throws(()=>updateGeckoProxy(dir,{type:'direct'}),/simulated preference rename failure/);
  } finally { fs.renameSync=rename; }
  assert.strictEqual(fs.readFileSync(file,'utf8'),beforeCollision);
  assert.strictEqual(fs.existsSync(collision),false);
  fs.writeFileSync(file,BEGIN+'\nmissing end');
  assert.throws(()=>updateGeckoProxy(dir,{type:'direct'}),/Malformed/);
  console.log('Firefox per-profile proxy preference tests passed');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
