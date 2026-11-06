'use strict';
const assert=require('node:assert/strict');
const {AndroidTargetGuard, sameTarget, TTL_MS}=require('../src/android/targetGuard');
const {AndroidAgentWorkflow, parseModelPlan, validatePlan}=
  require('../src/android/agentWorkflow');

let time=100000, seq=0, scans=0, tapped=[];
const freshNode=()=>({
  index:1,type:'Button',
  bounds:{left:10,top:20,right:110,bottom:120,x:60,y:70,width:100,height:100}
});
let liveNode=freshNode();
const inspector={
  async inspect(serial) {
    scans++;
    return {
      serial,capturedAt:time,privacy:'geometry-only',
      totalNodes:2,actionableCount:1,truncated:false,
      elements:[structuredClone(liveNode)]
    };
  }
};
const control={
  authorized:async serial=>{
    if(serial!=='emulator-5554')throw Error('Unauthorized Android serial');
    return 'adb.exe';
  },
  execute:async (serial,action,args)=>{
    tapped.push({serial,action,args});
    return {state:'executed'};
  },
  screenshot:async serial=>({serial,width:1080,height:1920,
    dataUrl:'data:image/png;base64,AAAA'})
};
const idFactory=()=>('00000000-0000-4000-8000-'+String(++seq).padStart(12,'0'));
const guard=new AndroidTargetGuard(inspector,control,{clock:()=>time,idFactory});
(async()=>{
  const first=await guard.scan('emulator-5554');
  assert.equal(first.privacy,'geometry-only');
  assert.equal(first.expiresInMs,TTL_MS);
  assert.equal(guard.validate('emulator-5554',first.scanId,1).bounds.x,60);
  assert.throws(()=>guard.validate('emulator-5555',first.scanId,1),/different device/);
  assert.throws(()=>guard.validate('emulator-5554',first.scanId,0),/Invalid inspected/);
  const matched=await guard.tap('emulator-5554',first.scanId,1);
  assert.equal(matched.state,'executed');
  assert.deepEqual(tapped.at(-1),{
    serial:'emulator-5554',action:'tap',args:{x:60,y:70}
  });
  await assert.rejects(guard.tap('emulator-5554',first.scanId,1),/missing, consumed/);
  assert.equal(scans,2);

  const changed=await guard.scan('emulator-5554');
  liveNode.bounds={...liveNode.bounds,x:65,left:15};
  await assert.rejects(guard.tap('emulator-5554',changed.scanId,1),/UI changed/);
  assert.equal(tapped.length,1);
  liveNode=freshNode();

  const stale=await guard.scan('emulator-5554');
  time+=TTL_MS+1;
  await assert.rejects(guard.tap('emulator-5554',stale.scanId,1),/missing, consumed/);
  assert.equal(tapped.length,1);

  const older=await guard.scan('emulator-5554');
  const newest=await guard.scan('emulator-5554');
  assert.throws(()=>guard.validate('emulator-5554',older.scanId,1),/missing/);
  guard.invalidate(newest.scanId);
  assert.throws(()=>guard.validate('emulator-5554',newest.scanId,1),/missing/);

  const inspectorTarget={action:'inspector-tap',args:{
    scanId:idFactory(),index:1
  }};
  assert.throws(()=>validatePlan({steps:[inspectorTarget,{action:'capture'}]}),/Unsupported/);
  assert.throws(()=>parseModelPlan(JSON.stringify({
    steps:[inspectorTarget,{action:'capture'}]
  })),/Unsupported/);
  assert.equal(sameTarget(freshNode(),freshNode()),true);
  assert.equal(sameTarget(freshNode(),{type:'TextView',bounds:freshNode().bounds}),false);

  // Inspector-to-Agent is a strictly local operator-selected path. No AI
  // proposal and no raw Android UI data is transmitted to a model.
  const advisor={status:()=>({configured:false}),
    ask:async()=>{throw Error('Unexpected remote advisor call');}};
  let sessionNumber=0;
  const engine=new AndroidAgentWorkflow(control,advisor,{
    clock:()=>time,idFactory:()=>String(++sessionNumber),targetGuard:guard
  });
  const selected=await guard.scan('emulator-5554');
  const plan=await engine.fromInspector('emulator-5554',selected.scanId,1);
  assert.equal(plan.source,'inspector-guided');
  assert.equal(plan.total,2);
  assert.equal(plan.steps[0].action,'inspector-tap');
  assert.deepEqual(plan.steps[0].args,{index:1});
  assert.equal(JSON.stringify(plan).includes(selected.scanId),false);
  assert.match(engine.confirmationDetails(plan.id),/UI Inspector #1/);
  const executed=await engine.next(plan.id);
  assert.equal(executed.state,'review');
  assert.equal(executed.index,1);
  assert.equal(executed.screenshot.width,1080);
  assert.equal(tapped.length,2);
  const last=await engine.next(plan.id);
  assert.equal(last.state,'completed');
  assert.equal(last.index,2);
  assert.equal(tapped.length,2);

  const expired=await guard.scan('emulator-5554');
  const stalePlan=await engine.fromInspector('emulator-5554',expired.scanId,1);
  time+=TTL_MS+1;
  const blocked=await engine.next(stalePlan.id);
  assert.equal(blocked.state,'blocked');
  assert.equal(tapped.length,2);
  assert.equal(blocked.screenshot,null);
  assert.equal(engine.cancel(stalePlan.id).state,'cancelled');

  const newPlanScan=await guard.scan('emulator-5554');
  const aborted=await engine.fromInspector('emulator-5554',newPlanScan.scanId,1);
  assert.equal(engine.cancel(aborted.id).state,'cancelled');
  guard.invalidate(newPlanScan.scanId);
  await assert.rejects(guard.tap('emulator-5554',newPlanScan.scanId,1),/missing/);

  console.log('Android Inspector-to-Agent guarded target tests: PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
