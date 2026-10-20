'use strict';
const assert=require('assert'),Store=require('../src/db/store');
const fs=require('fs'),path=require('path'),os=require('os');
const {proposeWorkflow,decodeDraft}=require('../src/ai/workflowDraft');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ai-flow-'));
 try{
  const store=new Store(root),p=store.saveProfile({name:'Private Customer',engine:'chromium'});
  const calls=[];
  let proposed={name:'Example Test',steps:[
   {type:'navigate',url:'https://example.com/'},{type:'wait',ms:500},
   {type:'approval',label:'Confirm first'},{type:'click',selector:'#demo'}
  ]};
  const advisor={async ask(input){
   calls.push(input);
   assert(!input.question.includes(p.id));
   assert(!input.question.includes(p.name));
   assert.strictEqual(input.includeStatistics,false);
   return {model:'openai/test',answer:JSON.stringify(proposed)};
  }};
  const args={profileId:p.id,hosts:'example.com',objective:'Test website example workflow',consent:true};
  await assert.rejects(()=>proposeWorkflow(advisor,store,{...args,consent:false}),/Confirm/);
  const result=await proposeWorkflow(advisor,store,args);
  assert.strictEqual(result.draft.profileId,p.id);
  assert.strictEqual(result.draft.steps.length,4);
  assert.strictEqual(calls.length,1);
  assert(!fs.existsSync(path.join(root,'automation-workflows.json')));
  proposed={name:'Bad domain',steps:[{type:'navigate',url:'https://accounts.google.com/'}]};
  await assert.rejects(()=>proposeWorkflow(advisor,store,{...args,hosts:'accounts.google.com'}),/không hợp lệ|Google Ads|đăng nhập/);
  proposed={name:'Missing approval',steps:[
   {type:'navigate',url:'https://example.com/'},{type:'fill',selector:'#email',value:'test'}
  ]};
  await assert.rejects(()=>proposeWorkflow(advisor,store,args),/xác nhận thủ công/);
  assert.throws(()=>decodeDraft('not JSON'),/valid JSON/);
  console.log('AI workflow drafts validate explicit consent, domain guards and manual approval');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});