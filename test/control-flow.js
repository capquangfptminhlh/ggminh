const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('../src/db/store');
const { WorkflowStore, AutomationRunner } = require('../src/automation/studio');
const { compileFlow } = require('../src/automation/controlFlow');

async function until(predicate) {
  for (let i=0;i<250;i++) {
    if(predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw Error('Timed out waiting for workflow');
}
function envelope(profileId,steps) {
  return {name:'Conditional flow',profileId,hosts:'example.com',steps};
}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-flow-'));
  try {
    const store=new Store(dir);
    const profile=store.saveProfile({name:'Automation QA'});
    const ws=new WorkflowStore(dir);
    const nav={type:'navigate',url:'https://example.com/'};
    const approval={type:'approval',label:'Confirm'};
    const flow=ws.save(envelope(profile.id,[
      nav,approval,{type:'repeat',count:3},{type:'if_exists',selector:'#visible'},
      {type:'click',selector:'#button'},{type:'else'},
      {type:'assert_text',selector:'h1',text:'Example'}, {type:'end_if'},
      {type:'end_repeat'}
    ]));
    const plan=compileFlow(flow.steps);
    assert.strictEqual(plan.conditions.get(3).elseIndex,5);
    assert.strictEqual(plan.conditions.get(3).endIndex,7);
    assert.strictEqual(plan.repeats.get(2),8);
    let available=true, clicks=0, assertions=0, opens=0, closed=0;
    const runner=new AutomationRunner(ws,store,async ()=>({
      open:async()=>{opens++;},
      url:async()=> 'https://example.com/',
      evaluate:async js=>{
        if(js.startsWith('Boolean(document.querySelector(')) return available;
        if(js.includes('el.click()')) clicks++;
        if(js.includes('textContent')) assertions++;
        return true;
      },
      close:()=>{closed++;}
    }));
    runner.run(flow.id);
    await until(()=>runner.status().needsApproval);
    runner.approve();
    await until(()=>runner.status().status==='completed' && !runner.task);
    assert.strictEqual(opens,1);
    assert.strictEqual(clicks,3);
    assert.strictEqual(assertions,0);
    assert.strictEqual(closed,1);
    assert(runner.status().executed <= 160);

    available=false;
    runner.run(flow.id);
    await until(()=>runner.status().needsApproval);
    runner.approve();
    await until(()=>runner.status().status==='completed' && !runner.task);
    assert.strictEqual(clicks,3);
    assert.strictEqual(assertions,3);

    assert.throws(()=>ws.save(envelope(profile.id,[nav,{type:'else'}])),/Nếu không/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,{type:'repeat',count:6},{type:'end_repeat'}])),/2–5/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,{type:'if_exists',selector:'h1'}, {type:'repeat',count:2},{type:'if_exists',selector:'h2'}, {type:'end_if'}, {type:'end_repeat'}, {type:'end_if'}])),/tối đa 2 tầng/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,{type:'if_exists',selector:'h1'}])),/Chưa đóng khối/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,{type:'repeat',count:2},{type:'end_if'}])),/đóng sai/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,
      {type:'if_exists',selector:'h1'},{type:'approval'},{type:'click',selector:'button'},{type:'end_if'}
    ])),/xác nhận thủ công/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,
      {type:'if_exists',selector:'h1'},{type:'end_if'},{type:'approval'},{type:'click',selector:'button'}
    ])),/xác nhận thủ công/);
    assert.throws(()=>ws.save(envelope(profile.id,[nav,approval,{type:'repeat',count:5},
      {type:'repeat',count:5},...Array.from({length:7},()=>({type:'wait',ms:100})),
      {type:'end_repeat'},{type:'end_repeat'}
    ])),/160 lượt/);

    const stop=ws.save(envelope(profile.id,[nav,{type:'repeat',count:5},{type:'wait',ms:15000},{type:'end_repeat'}]));
    runner.run(stop.id);
    await until(()=>runner.status().step===2);
    runner.stop();
    await until(()=>runner.status().status==='stopped' && !runner.task);
    assert.strictEqual(runner.status().needsApproval,false);
    const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
    const studioJs=fs.readFileSync(path.join(__dirname,'../src/ui/workflowStudio.js'),'utf8');
    for(const type of ['if_exists','else','end_if','repeat','end_repeat']) {
      assert(html.includes('value="'+type+'"'),'Missing UI option '+type);
      assert(studioJs.includes(type+': () =>'),'Missing editor draft '+type);
    }
    assert(html.includes('id="studio-add-type"')); // Verify the functional RPA editor, not a historical UI version
    assert(studioJs.includes('blockDepth * 14'));
    console.log('Studio 2.4 condition/else/loops, safety, stop and editor tests passed');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
