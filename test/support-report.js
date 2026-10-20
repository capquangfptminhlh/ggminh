'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {buildSupportReport}=require('../src/ops/supportReport');
const {buildReadiness}=require('../src/health/releaseReadiness');
const sensitive='PRIVATE_CUSTOMER_TOKEN_2026';
const readiness=buildReadiness({
 profiles:[{id:'p-1',name:sensitive,proxy:{type:'http',host:'proxy.internal',port:8888,authProxyId:'px_0123456789abcdef'}}],
 proxies:[{id:'px_0123456789abcdef',type:'http',host:'proxy.internal',port:8888,
   check:{verified:false,message:sensitive}}],
 reports:[{status:'error',issues:[{code:'browser_missing',message:sensitive}]}],
 vault:{available:()=>false,has:()=>false}
});
readiness.items[0].detail=sensitive;
const report=buildSupportReport(readiness,{
 version:'2.9.0',platform:'win32',arch:'x64',irrelevant:sensitive
});
const serialized=JSON.stringify(report);
for(const secret of [sensitive,'proxy.internal','px_0123456789abcdef','p-1'])
 assert(!serialized.includes(secret),'Sensitive information leaked: '+secret);
assert.strictEqual(report.format,'LHM-SUPPORT-REPORT-1');
assert.strictEqual(report.counts.profiles,1);
assert(report.checks.some(c=>c.code==='vault'&&c.status==='error'));
assert.deepStrictEqual(Object.keys(report.environment),['platform','arch']);
const base=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(base,'src/ui/index.html'),'utf8');
const renderer=fs.readFileSync(path.join(base,'src/ui/maintenance.js'),'utf8');
const main=fs.readFileSync(path.join(base,'main.js'),'utf8');
assert(html.includes('id="health-support-export"'));
assert(renderer.includes("api.exportSupportReport()"));
assert(main.includes("ipcMain.handle('export-support-report'"));
assert(fs.readFileSync(path.join(base,'preload.js'),'utf8').includes("ipcRenderer.invoke('export-support-report')"));
console.log('Support export counts-only, no secret/path exposure and UI dispatch tests passed');