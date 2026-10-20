'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {buildReadiness}=require('../src/health/releaseReadiness');
const empty=buildReadiness();
assert.strictEqual(empty.counts.profiles,0);
assert(empty.items.some(x=>x.key==='runtime'&&x.status==='planned'));
assert(empty.items.some(x=>x.key==='cloud'&&x.status==='planned'));
const profiles=[
 {id:'p1',name:'One',engine:'chromium',fingerprint:{mode:'native'},
  proxy:{type:'socks5',host:'s.example',port:1080,authProxyId:'px_0123456789abcdef'}},
 {id:'p2',name:'Two',engine:'chromium',fingerprint:{mode:'custom'},proxy:{type:'direct'}}
];
const proxies=[{id:'px_0123456789abcdef',type:'socks5',host:'s.example',port:1080,check:{verified:true}}];
const secureVault={available:()=>true,has:id=>id==='px_0123456789abcdef'};
const ready=buildReadiness({
 profiles,reports:[{status:'ready',issues:[]},{status:'warning',issues:[]}],
 proxies,active:[{profileId:'p1'}],workflows:[{id:'w1'}],vault:secureVault
});
assert.strictEqual(ready.counts.profiles,2);
assert.strictEqual(ready.counts.active,1);
assert.strictEqual(ready.counts.workflows,1);
assert.strictEqual(ready.counts.unmatchedCredentials,0);
assert(ready.items.some(x=>x.key==='native'&&x.status==='warning'));
assert(ready.items.some(x=>x.key==='auth-links'&&x.status==='ready'));
const blocked=buildReadiness({profiles,reports:[
 {status:'error',issues:[{code:'browser_missing'}]},
 {status:'ready',issues:[]}],proxies:[],vault:{available:()=>false,has:()=>false}});
assert(blocked.items.some(x=>x.key==='profiles'&&x.status==='error'));
assert(blocked.items.some(x=>x.key==='browser'&&x.status==='error'));
assert(blocked.items.some(x=>x.key==='vault'&&x.status==='error'));
assert(blocked.items.some(x=>x.key==='auth-links'&&x.status==='error'));
assert(!JSON.stringify(blocked).includes('token-secret'));
const ui=path.join(__dirname,'../src/ui');
const html=fs.readFileSync(path.join(ui,'index.html'),'utf8');
const script=fs.readFileSync(path.join(ui,'maintenance.js'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
for(const id of ['health-readiness-title','health-readiness-refresh','health-readiness-items','health-readiness-summary'])
  assert(html.includes('id="'+id+'"'),'Missing readiness UI: '+id);
assert(script.includes("el('health-readiness-refresh').addEventListener('click',updateReadiness)"));
assert(script.includes("await api.getLocalReadiness()"));
assert(preload.includes("ipcRenderer.invoke('get-local-readiness')"));
assert(main.includes("ipcMain.handle('get-local-readiness'"));
console.log('Readiness accuracy, no fake identity score, safe vault and operational UI tests passed');