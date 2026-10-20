'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {AIAdvisor,safeStats,checkModel,ENDPOINT}=require('../src/ai/advisor');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ai-'));
(async()=>{
 try{
  const codec={isEncryptionAvailable:()=>true,
   encryptString:value=>Buffer.from('encrypt-'+value.split('').reverse().join('')),
   decryptString:buffer=>buffer.toString().slice(8).split('').reverse().join('')};
  const sent=[];let tick=1000000;
  const fetcher=async(url,init)=>{
   sent.push({url,init});
   assert.strictEqual(url,ENDPOINT);
   assert.strictEqual(init.method,'POST');
   assert.strictEqual(init.redirect,'error');
   assert.strictEqual(init.headers.Authorization,'Bearer sk-or-v1-a-test-secret-token');
   const body=JSON.parse(init.body);
   assert.strictEqual(body.messages.length,2);
   assert(!init.body.includes('private.customer'));
   assert(!init.body.includes('proxy.secret'));
   assert(!init.body.includes('Customers Ltd'));
   assert(!init.body.includes('password='));
   return {ok:true,status:200,headers:{get:()=>null},json:async()=>({
    choices:[{message:{content:'Please use named groups'}}],
    usage:{prompt_tokens:30,completion_tokens:7}
   })};
  };
  const advisor=new AIAdvisor(root,codec,{fetcher,clock:()=>tick});
  assert(!advisor.status().configured);
  assert.throws(()=>advisor.configure({key:'too-short'}),/không hợp lệ/);
  assert.throws(()=>checkModel('https://evil.example.com'),/Model ID/);
  const key='sk-or-v1-a-test-secret-token';
  advisor.configure({model:'openai/gpt-4o-mini',key});
  assert(advisor.status().configured);
  const disk=fs.readFileSync(advisor.file,'utf8');
  assert(!disk.includes(key),'API key must never be stored as plain text');
  assert(!JSON.stringify(advisor.status()).includes(key));
  const stats=safeStats([
   {name:'Customers Ltd',group:'Private Group',engine:'gecko',proxy:{type:'http',host:'proxy.secret'}},
   {name:'Agency',group:'Private Group',engine:'chromium',proxy:{type:'direct'}}
  ]);
  assert.deepStrictEqual(stats,{total:2,chromium:1,firefox:1,direct:1,proxy:1,groups:1});
  const response=await advisor.ask({question:'How do I organize profiles?',includeStatistics:true},
   [{name:'Customers Ltd',group:'Private Group',engine:'gecko',proxy:{type:'http',host:'proxy.secret'}}]);
  assert.strictEqual(response.answer,'Please use named groups');
  assert(response.sentStatistics);
  assert(JSON.parse(sent[0].init.body).messages[1].content.includes('"total":1'));
  assert(!sent[0].init.body.includes('Private Group'));
  await assert.rejects(()=>advisor.ask({question:'Again',includeStatistics:false}),/7 giây/);
  tick+=7500;
  const response2=await advisor.ask({question:'Explain backups',includeStatistics:false});
  assert.strictEqual(response2.sentStatistics,false);
  assert(!sent[1].init.body.includes('"total"'));
  const reopened=new AIAdvisor(root,codec,{fetcher,clock:()=>tick+7500});
  assert(reopened.status().configured);
  reopened.clear();
  assert(!reopened.status().configured);
  assert(!fs.readFileSync(reopened.file,'utf8').includes(key));
  const disabled=new AIAdvisor(path.join(root,'disabled'),{...codec,isEncryptionAvailable:()=>false},{fetcher});
  assert.throws(()=>disabled.configure({key}),/encryption/);
  console.log('AI OpenRouter key encryption, sanitized opt-in statistics, limits and response contract passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
