const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const Store=require('../src/db/store');
const {WorkflowStore,AutomationRunner,checkUrl}=require('../src/automation/studio');
async function until(check){
  for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}
  throw Error('Test timeout');
}
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-studio-'));
  try{
    const store=new Store(dir);
    const profile=store.saveProfile({name:'Demo',proxy:{type:'direct'}});
    const workflows=new WorkflowStore(dir);
    assert.throws(()=>checkUrl('file:///etc/passwd',['example.com']),/HTTP/);
    assert.throws(()=>checkUrl('https://ads.google.com',['ads.google.com']),/Google Ads/);
    assert.throws(() => workflows.save({name:'Unsafe',profileId:profile.id,hosts:'example.com',
      steps:[{type:'navigate',url:'https://example.com'},{type:'click',selector:'button'}]}),/xác nhận thủ công/);
    assert.throws(() => workflows.save({name:'OTP',profileId:profile.id,hosts:'example.com',
      steps:[{type:'navigate',url:'https://example.com'},{type:'approval'},
        {type:'fill',selector:'input[name="otp"]',value:'123456'}]}),/mật khẩu/);
    const data=workflows.save({
      name:'Demo',profileId:profile.id,hosts:'example.com',
      steps:[{type:'navigate',url:'https://example.com/'},
        {type:'assert_text',selector:'h1',text:'Example'},
        {type:'approval',label:'Xác nhận'},{type:'wait',ms:100}]
    });
    assert.strictEqual(new WorkflowStore(dir).list()[0].id,data.id);
    let closed=0;
    const make=async()=>({
      open:async()=>{},
      url:async()=>'https://example.com/',
      evaluate:async()=>true,
      close:()=>{closed++;}
    });
    const runner=new AutomationRunner(workflows,store,make);
    runner.run(data.id);
    assert.strictEqual(runner.status().profileId, profile.id);
    await until(()=>runner.status().needsApproval);
    runner.approve();
    await until(()=>runner.status().status==='completed');
    assert(closed>0);
    const stopFlow=workflows.save({name:'Stop',profileId:profile.id,hosts:'example.com',
      steps:[{type:'navigate',url:'https://example.com'},{type:'wait',ms:15000}]});
    runner.run(stopFlow.id);
    await until(()=>runner.status().step===1);
    runner.stop();
    await until(()=>runner.status().status==='stopped');
    assert(workflows.delete(stopFlow.id));
    console.log('Studio workflow tests passed');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
