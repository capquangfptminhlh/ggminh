'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {spawnJobSupervisor}=require('../src/engine/jobSupervisor');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const helper=new EventEmitter();helper.stdin=new PassThrough();helper.stdout=new PassThrough();helper.stderr=new PassThrough();
 helper.kill=()=>{};
 const proc=spawnJobSupervisor(process.execPath,[],{supervisorSpawner:()=>helper});
 proc.on('error',()=>{});
 const send=value=>helper.stdout.write(JSON.stringify(value)+'\n');
 return {proc,send};
}
(async()=>{
 const {proc,send}=fixture();
 send({event:'started',pid:1234});await tick();const resumed=proc.resume();
 send({event:'resumed'});await resumed;
 assert.equal(proc.windowState,'unobserved');
 send({event:'window-state',state:'unknown'});await tick();
 assert.equal(proc.windowState,'unknown');assert.equal(proc.windowStateCounts.unknown,1);
 send({event:'dialog-blocked'});send({event:'window-state',state:'dialog'});await tick();
 assert.equal(proc.dialogBlocked,true);assert.equal(proc.windowState,'dialog');
 let cancelled=0;proc.on('stop-cancelled',()=>cancelled++);
 send({event:'window-state',state:'clear'});send({event:'dialog-cleared'});await tick();
 assert.equal(proc.windowState,'clear');assert.equal(proc.dialogBlocked,false);assert.equal(cancelled,1);
 assert.deepEqual(proc.windowStateCounts,{unknown:1,dialog:1,clear:1});
 send({event:'close-summary',attempts:3,sent:1,notSent:2,errors:0,forced:true});await tick();
 assert.deepEqual(proc.closeSummary,{attempts:3,sent:1,notSent:2,errors:0,forced:true});
 send({event:'root-exited',code:0});send({event:'empty'});await tick();assert.equal(proc.jobComplete,true);
 const legacy=fixture();let legacyFailure='';legacy.proc.on('error',e=>legacyFailure=e.message);
 legacy.send({event:'started',pid:1234});await tick();const legacyResumed=legacy.proc.resume();
 legacy.send({event:'resumed'});await legacyResumed;
 legacy.send({event:'dialog-blocked'});legacy.send({event:'dialog-cleared'});
 legacy.send({event:'root-exited',code:0});legacy.send({event:'empty'});await tick();
 assert.equal(legacyFailure,'');assert.equal(legacy.proc.windowState,'unobserved');assert.equal(legacy.proc.jobComplete,true);
 const invalid=fixture();let failure='';invalid.proc.on('error',e=>failure=e.message);
 invalid.send({event:'started',pid:1234});await tick();const resumed2=invalid.proc.resume();
 invalid.send({event:'resumed'});await resumed2;
 invalid.send({event:'window-state',state:'sensitive-window-title'});await tick();
 assert.equal(failure,'Browser job supervisor returned invalid state');
 assert(!JSON.stringify(invalid.proc.windowStateCounts).includes('sensitive'));
 const malformed=fixture();let malformedFailure='';malformed.proc.on('error',e=>malformedFailure=e.message);
 malformed.send({event:'started',pid:1234});await tick();const r=malformed.proc.resume();malformed.send({event:'resumed'});await r;
 malformed.send({event:'close-summary',attempts:1,sent:2,notSent:0,errors:0,forced:true});await tick();
 assert.equal(malformedFailure,'Browser job supervisor returned invalid state');
 console.log('Window state protocol validates enums without changing dialog stop handling: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
