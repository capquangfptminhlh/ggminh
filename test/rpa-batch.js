'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const Store=require('../src/db/store');
const {WorkflowStore,AutomationRunner}=require('../src/automation/studio');
const {BatchAutomation}=require('../src/automation/batch');
const sleep=()=>new Promise(resolve=>setTimeout(resolve,12));
async function settled(batch){
 for(let i=0;i<300&&batch.status().active;i++)await sleep();
 assert.strictEqual(batch.status().active,false,'Batch did not finish');
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-rpa-batch-'));
 try{
  const store=new Store(dir);
  const a=store.saveProfile({name:'A',engine:'chromium'});
  const b=store.saveProfile({name:'B',engine:'chromium'});
  const bad=store.saveProfile({name:'Firefox',engine:'gecko'});
  const workflows=new WorkflowStore(dir);
  const item=workflows.save({name:'Status check',profileId:a.id,
   hosts:'example.com',steps:[{type:'navigate',url:'https://example.com/'},
    {type:'assert_text',selector:'h1',text:'Example Domain'}]});
  const opened=[];
  const createBrowser=async profileId=>{
   opened.push(profileId);
   return {open:async()=>{},url:async()=> 'https://example.com/',
    evaluate:async()=>true,close:()=>{}};
  };
  const runner=new AutomationRunner(workflows,store,createBrowser);
  const batch=new BatchAutomation(dir,workflows,store,runner);
  const preview=batch.preview(item.id,[a.id,b.id],'continue');
  assert.strictEqual(preview.profiles.length,2);
  assert.deepStrictEqual(opened,[]);
  assert.throws(()=>batch.preview(item.id,[bad.id]),/Chromium/);
  assert.throws(()=>batch.preview(item.id,[a.id],'skip'),/stop or continue/);
  batch.start(item.id,[a.id,b.id],'continue');
  assert(batch.status().active);
  assert.throws(()=>runner.run(item.id),/bận|hàng đợi|đang chạy/i);
  assert.throws(()=>batch.start(item.id,[a.id]),/hàng đợi/);
  await settled(batch);
  assert.deepStrictEqual(opened,[a.id,b.id]);
  assert.strictEqual(batch.status().batch.status,'completed');
  assert.deepStrictEqual(batch.status().batch.tasks.map(x=>x.status),['completed','completed']);
  assert.strictEqual(runner.batchOwner,null);
  assert.strictEqual(new BatchAutomation(dir,workflows,store,runner).status().batch.status,'completed');

  const failures=[];
  const flaky=new AutomationRunner(workflows,store,async id=>({
   open:async()=>{},url:async()=> 'https://example.com/',
   evaluate:async()=>id!==a.id,close:()=>{failures.push(id);}
  }));
  const other=new BatchAutomation(path.join(dir,'separate'),workflows,store,flaky);
  other.start(item.id,[a.id,b.id],'stop');
  await settled(other);
  assert.strictEqual(other.status().batch.status,'failed');
  assert.deepStrictEqual(other.status().batch.tasks.map(x=>x.status),['failed','skipped']);
  assert.deepStrictEqual(failures,[a.id]);

  const approvalFlow=workflows.save({name:'Approval',profileId:a.id,hosts:'example.com',
   steps:[{type:'navigate',url:'https://example.com/'},
    {type:'approval',label:'Manually allow'}, {type:'click',selector:'#go'}]});
  const gated=new AutomationRunner(workflows,store,createBrowser);
  const withApproval=new BatchAutomation(path.join(dir,'approval'),workflows,store,gated);
  withApproval.start(approvalFlow.id,[a.id,b.id],'stop');
  for(let i=0;i<30&&!gated.status().needsApproval;i++)await sleep();
  assert(gated.status().needsApproval);
  gated.approve();
  for(let i=0;i<30&&gated.status().profileId!==b.id;i++)await sleep();
  for(let i=0;i<30&&!gated.status().needsApproval;i++)await sleep();
  assert(gated.status().needsApproval);
  gated.approve();await settled(withApproval);
  assert.strictEqual(withApproval.status().batch.status,'completed');
  const aborted=new BatchAutomation(path.join(dir,'abort'),workflows,store,new AutomationRunner(workflows,store,createBrowser));
  aborted.start(approvalFlow.id,[a.id,b.id],'continue');aborted.stop();
  await settled(aborted);
  assert.strictEqual(aborted.status().batch.status,'stopped');
  assert(aborted.status().batch.tasks.every(x=>['stopped','skipped'].includes(x.status)));
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  assert(ui.includes('id="studio-batch-run"'));
  console.log('v4.6 sequential multi-profile RPA queue, approvals, recovery, stop-on-error and audit passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
