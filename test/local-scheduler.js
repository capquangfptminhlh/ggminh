'use strict';
const assert=require('assert');
const fs=require('fs'),path=require('path'),os=require('os');
const {LocalScheduler,safeFlow}=require('../src/automation/localScheduler');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-schedule-'));
 let now=Date.UTC(2026,9,20,12,0,0),running=false;
 const flows=new Map([
  ['read',{id:'read',name:'Read only',steps:[{type:'navigate',url:'https://example.org'},
    {type:'assert_text',selector:'h1',text:'Okay'}]}],
  ['write',{id:'write',name:'Write action',steps:[{type:'navigate'}, {type:'approval'}, {type:'click'}]}],
  ['confirm',{id:'confirm',name:'Requires approval',steps:[{type:'navigate'},{type:'approval'}]}]
 ]);
 const store={get:id=>flows.get(id)};
 const called=[];
 const runner={task:null,status:()=>({status:running?'running':'idle'}),run:id=>{called.push(id);running=true;}};
 try {
   const scheduler=new LocalScheduler(root,store,runner,{now:()=>now});
   assert.strictEqual(safeFlow(flows.get('read')),true);
   assert.strictEqual(safeFlow(flows.get('write')),false);
   assert.throws(()=>scheduler.create({workflowId:'write',nextRunAt:new Date(now+60000).toISOString(),intervalMinutes:0}),/chỉ đọc/);
   assert.throws(()=>scheduler.create({workflowId:'confirm',nextRunAt:new Date(now+60000).toISOString(),intervalMinutes:0}),/chỉ đọc/);
   assert.throws(()=>scheduler.create({workflowId:'read',nextRunAt:new Date(now-1).toISOString(),intervalMinutes:0}),/tương lai/);
   assert.throws(()=>scheduler.create({workflowId:'read',nextRunAt:new Date(now+60000).toISOString(),intervalMinutes:7}),/Chu kỳ/);
   const once=scheduler.create({workflowId:'read',nextRunAt:new Date(now+60000).toISOString(),intervalMinutes:0});
   assert.strictEqual(scheduler.list().length,1);
   assert.strictEqual((await scheduler.tick()).started,0);
   now+=60000;
   assert.strictEqual((await scheduler.tick()).started,1);
   assert.deepStrictEqual(called,['read']);
   assert.strictEqual(scheduler.list()[0].enabled,false);
   const reloaded=new LocalScheduler(root,store,runner,{now:()=>now});
   assert.strictEqual(reloaded.list()[0].id,once.id);
   running=false;
   const recurring=reloaded.create({workflowId:'read',nextRunAt:new Date(now+60000).toISOString(),intervalMinutes:15});
   now+=60000;
   running=true;
   assert.strictEqual((await reloaded.tick()).started,0);
   assert.strictEqual(reloaded.list().find(x=>x.id===recurring.id).lastStatus,'waiting_for_idle');
   running=false;
   assert.strictEqual((await reloaded.tick()).started,1);
   assert.strictEqual(reloaded.list().find(x=>x.id===recurring.id).nextRunAt,
     new Date(now+15*60000).toISOString());
   running=false;
   flows.set('read',{id:'read',name:'Modified',steps:[{type:'navigate'},{type:'fill',value:'secret'}]});
   now+=15*60000;
   assert.strictEqual((await reloaded.tick()).started,0);
   assert.strictEqual(reloaded.list().find(x=>x.id===recurring.id).lastStatus,'blocked');
   assert.strictEqual(reloaded.list().find(x=>x.id===recurring.id).enabled,false);
   assert.throws(()=>reloaded.setEnabled(recurring.id,true),/không được phép/);
   assert.strictEqual(reloaded.remove(once.id),true);
   assert.strictEqual(reloaded.remove(once.id),false);
   const db=fs.readFileSync(path.join(root,'automation-schedules.json'),'utf8');
   assert(!db.includes('secret'));
   console.log('Local scheduler tests: read-only guard, recurrence, app-busy deferral, persistence and mutation blocking passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});