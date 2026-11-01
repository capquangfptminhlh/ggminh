'use strict';
const assert=require('node:assert/strict');
const {AndroidAgentWorkflow,validatePlan,parseModelPlan,redactedStep}=
  require('../src/android/agentWorkflow');

const sample={steps:[
  {action:'key',args:{key:'HOME'},note:'Về trang chủ'},
  {action:'capture',note:'Kiểm tra ảnh màn hình'}
]};
assert.equal(validatePlan(sample).steps.length,2);
assert.deepEqual(parseModelPlan(JSON.stringify(sample)),sample);
assert.throws(()=>parseModelPlan('not JSON'),/strict JSON/);
assert.throws(()=>validatePlan({steps:[]}),/1–6/);
assert.throws(()=>validatePlan({steps:[{action:'shell',args:{command:'id'}}]}),/Unsupported/);
assert.throws(()=>validatePlan({steps:[{action:'key',args:{key:'HOME'}}]}),/must be capture/);
assert.throws(()=>validatePlan({steps:[{action:'text',args:{text:'a;rm -rf'}},{action:'capture'}]}),/basic Latin/);
assert.deepEqual(redactedStep({action:'text',args:{text:'sometext'},note:'Test'}).args,{characters:8});
assert.equal(redactedStep({action:'text',args:{text:'sometext'},note:'private text'}).note,'Gõ văn bản đã được ẩn');

let now=1000,number=0,asks=[],screens=0;
const actions=[];
const control={
  authorized:async serial=>{
    if(serial!=='emulator-5554')throw Error('Device is unauthorized');
  },
  execute:async (serial,action,args)=>{
    actions.push({serial,action,args});
    return {state:'executed'};
  },
  screenshot:async serial=>{
    screens++;
    return {serial,width:800,height:1200,
      dataUrl:'data:image/png;base64,AAAA'};
  }
};
const advisor={
  status:()=>({configured:true}),
  ask:async (payload,profiles)=>{
    asks.push({payload,profiles});
    return {answer:JSON.stringify(sample),model:'provider/model'};
  }
};
const engine=new AndroidAgentWorkflow(control,advisor,{
  clock:()=>now,idFactory:()=>String(++number)
});
(async()=>{
  await assert.rejects(engine.propose('emulator-5554','test home',false),/consent/);
  assert.equal(asks.length,0);
  const plan=await engine.propose('emulator-5554','test home',true);
  assert.equal(plan.id,'1');
  assert.equal(plan.serial,'emulator-5554');
  assert.equal(plan.total,2);
  assert.equal(asks[0].payload.includeStatistics,false);
  assert.deepEqual(asks[0].profiles,[]);
  assert.equal(asks[0].payload.question.includes('data:image'),false);
  await assert.rejects(engine.template('emulator-5554'),/Cancel the existing/);
  const first=await engine.next(plan.id);
  assert.equal(first.state,'review');
  assert.equal(first.index,1);
  assert.equal(first.screenshot.width,800);
  assert.equal(actions.length,1);
  assert.equal(screens,1);
  assert.deepEqual(actions[0].args,{key:'HOME'});
  const last=await engine.next(plan.id);
  assert.equal(last.state,'completed');
  assert.equal(last.done,true);
  assert.equal(last.index,2);
  assert.equal(screens,2);
  assert.equal(actions.length,1);
  await assert.rejects(engine.next(plan.id),/completed or blocked/);
  const second=await engine.template('emulator-5554');
  assert.equal(second.source,'offline-template');
  assert.equal(engine.cancel(second.id).state,'cancelled');
  await assert.rejects(engine.next(second.id),/not found/);

  // Bad model content cannot perform arbitrary ADB commands.
  advisor.ask=async()=>({answer:JSON.stringify({steps:[
    {action:'shell',args:{command:'pm clear org.example'}},
    {action:'capture'}]}),model:'test'});
  await assert.rejects(engine.propose('emulator-5554','do anything',true),/Unsupported/);
  assert.equal(actions.length,1);

  const third=await engine.template('emulator-5554');
  now+=10*60*1000+1;
  await assert.rejects(engine.next(third.id),/not found or expired/);
  now=2000000;

  // An unknown ADB result stops a plan. No automatic retries on tap/text.
  const failing=new AndroidAgentWorkflow({
    ...control,
    execute:async()=>{throw Error('ADB timed out');}
  },advisor,{clock:()=>now,idFactory:()=>String(++number)});
  const f=await failing.template('emulator-5554');
  const blocked=await failing.next(f.id);
  assert.equal(blocked.state,'blocked');
  assert.match(blocked.error,/uncertain/);
  await assert.rejects(failing.next(f.id),/completed or blocked/);

  // Concurrent execution of the same step is rejected.
  let unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const slow=new AndroidAgentWorkflow({
    ...control,execute:async()=>gate
  },advisor,{clock:()=>now,idFactory:()=>String(++number)});
  const s=await slow.template('emulator-5554');
  const pending=slow.next(s.id);
  await Promise.resolve();await Promise.resolve();
  await assert.rejects(slow.next(s.id),/already running/);
  await assert.rejects(Promise.resolve().then(()=>slow.cancel(s.id)),/step is running/);
  unblock();await pending;
  assert.equal(slow.preview(s.id).index,1);

  // Screenshot failure blocks any next action, even after ADB returned OK.
  const noScreenshot=new AndroidAgentWorkflow({
    ...control,screenshot:async()=>{throw Error('USB disconnected');}
  },advisor,{clock:()=>now,idFactory:()=>String(++number)});
  const snapPlan=await noScreenshot.template('emulator-5554');
  const blockedCapture=await noScreenshot.next(snapPlan.id);
  assert.equal(blockedCapture.state,'blocked');
  assert.match(blockedCapture.error,/Verification screenshot unavailable/);
  assert.equal(blockedCapture.next,null);
  await assert.rejects(noScreenshot.next(snapPlan.id),/completed or blocked/);
  assert.equal(noScreenshot.cancel(snapPlan.id).state,'cancelled');
  console.log('Android Agent human approval workflow tests: PASS');
})().catch(err=>{console.error(err);process.exitCode=1;});
