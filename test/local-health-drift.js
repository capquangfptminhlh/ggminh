'use strict';
const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const {LocalHealthDrift,detectDrift}=require('../src/health/localDrift');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-health-trend-'));
let time=Date.UTC(2026,9,21,8);
const step=()=>{time+=31*60*1000;};
const file=path.join(root,'health-drift.json');
const health=(errors,warnings=1)=>({profiles:20,errors,warnings,active:3,
 appVersion:'5.8.0'});
try{
 const monitor=new LocalHealthDrift(root,{now:()=>time});
 assert.strictEqual(monitor.report().stored,0);
 assert.strictEqual(monitor.report().drift.status,'insufficient');
 for(let n=0;n<4;n++){
  monitor.add(health(1));step();
 }
 assert.throws(()=>monitor.add({profiles:1,errors:2,warnings:0,active:1}),/exceed/);
 // Object projection is strict: unknown personal fields are never persisted.
 const extra={...health(1),ip:'192.0.2.50',password:'DO_NOT_SAVE',
  profileId:'ACCOUNT_SECRET',cookie:'COOKIE_SECRET',
  mouse:{x:100,y:40},url:'https://example.com/private'};
 monitor.add(extra);step();
 monitor.add(health(11));step();
 monitor.add(health(12));step();
 const latest=monitor.add({...health(13),appVersion:'5.8.1'});
 assert.strictEqual(latest.drift.status,'investigate');
 assert.strictEqual(latest.drift.versionChanged,true);
 assert(latest.drift.errorChange>=0.3);
 assert(latest.drift.baseline.snapshots>=3);
 assert(latest.drift.recent.snapshots===3);
 const disk=fs.readFileSync(file,'utf8');
 for(const secret of ['192.0.2.50','DO_NOT_SAVE','ACCOUNT_SECRET',
  'COOKIE_SECRET','example.com/private','mouse']){
  assert(!disk.includes(secret),'Unexpected private data stored: '+secret);
 }
 assert.strictEqual(JSON.parse(disk).length,8);
 assert.throws(()=>monitor.add(health(3)),/30 minutes/);
 const reloaded=new LocalHealthDrift(root,{now:()=>time});
 assert.strictEqual(reloaded.report().stored,8);
 const exp=reloaded.exportReport();
 assert(JSON.parse(exp).schema===1);
 assert(!exp.includes('password'));
 assert.strictEqual(reloaded.clear().cleared,true);
 assert.deepStrictEqual(JSON.parse(fs.readFileSync(file,'utf8')),[]);
 fs.writeFileSync(file,'{"broken":');
 assert.throws(()=>new LocalHealthDrift(root,{now:()=>time}),/cannot be read/);
 assert.strictEqual(fs.readFileSync(file,'utf8'),'{"broken":');
 const ui=fs.readFileSync(path.join(__dirname,'..','src/ui/index.html'),'utf8');
 const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
 const preload=fs.readFileSync(path.join(__dirname,'..','preload.js'),'utf8');
 const renderer=fs.readFileSync(path.join(__dirname,'..','src/ui/maintenance.js'),'utf8');
 for(const id of ['local-drift-record','local-drift-refresh','local-drift-export',
   'local-drift-clear','local-drift-results']){
   assert(ui.includes('id="'+id+'"'));
   assert(renderer.includes("el('"+id+"')"));
 }
 for(const channel of ['health-drift-report','health-drift-snapshot',
  'health-drift-export','health-drift-clear'])
   assert(main.includes("ipcMain.handle('"+channel+"'"));
 for(const action of ['healthDriftSnapshot','healthDriftReport',
  'healthDriftExport','healthDriftClear'])assert(preload.includes(action+':'));
 const short=detectDrift([{at:time,profiles:1,errors:0,warnings:0,active:0,appVersion:'5.8.0'}]);
 assert.strictEqual(short.status,'insufficient');
 console.log('Opt-in local aggregate drift, privacy, trends, export, explicit deletion, corrupt-data preservation and UI IPC passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
