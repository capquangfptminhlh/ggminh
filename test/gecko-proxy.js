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
  fs.writeFileSync(file,BEGIN+'\nmissing end');
  assert.throws(()=>updateGeckoProxy(dir,{type:'direct'}),/Malformed/);
  console.log('Firefox per-profile proxy preference tests passed');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
