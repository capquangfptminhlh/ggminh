'use strict';
const assert=require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const {AIUsageBudget}=require('../src/ai/usageBudget');
const {AIAdvisor}=require('../src/ai/advisor');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-ai-budget-'));
(async()=>{
 try {
  let time=new Date(2026,9,31,12).getTime();
  const clock=()=>time;
  const budget=new AIUsageBudget(root,{clock});
  assert.strictEqual(budget.status().limit,0,'Default remains unlimited; existing LHM flows preserved');
  assert.strictEqual(budget.status().attempts,0);
  assert.throws(()=>budget.setLimit(-1),/0 đến 1000/);
  assert.throws(()=>budget.setLimit(1001),/0 đến 1000/);
  assert.throws(()=>budget.setLimit(1.5),/0 đến 1000/);
  budget.setLimit(2);
  budget.reserveAttempt();
  budget.recordResponse({promptTokens:42,completionTokens:11});
  budget.reserveAttempt();
  budget.recordResponse({});
  assert.strictEqual(budget.status().attempts,2);
  assert.strictEqual(budget.status().successes,2);
  assert.strictEqual(budget.status().promptTokens,42);
  assert.strictEqual(budget.status().completionTokens,11);
  assert.strictEqual(budget.status().unreportedUsage,1);
  assert.strictEqual(budget.status().remaining,0);
  assert.throws(()=>budget.reserveAttempt(),/hết hạn mức/);
  const disk=fs.readFileSync(budget.file,'utf8');
  for(const term of ['sk-or-secret','password','secret user text','question content','cookie value','http://'])
   assert(!disk.includes(term),'Usage ledger should contain no sensitive text: '+term);

  const second=new AIUsageBudget(root,{clock});
  assert.strictEqual(second.status().attempts,2,'Requests persist across restarts');
  time=new Date(2026,10,1,12).getTime();
  assert.strictEqual(second.status().attempts,0,'Counters roll over on local calendar month');
  assert.strictEqual(second.status().limit,2,'Monthly budget setting survives rollover');
  second.reserveAttempt();
  assert.strictEqual(new AIUsageBudget(root,{clock}).status().attempts,1);

  const advisorRoot=fs.mkdtempSync(path.join(root,'advisor-'));
  const codec={
   isEncryptionAvailable:()=>true,
   encryptString:x=>Buffer.from('mock-'+x.split('').reverse().join('')),
   decryptString:buffer=>buffer.toString().slice(5).split('').reverse().join('')
  };
  let outbound=0;
  const fetcher=async()=>{outbound++;return {
   ok:true,status:200,headers:{get:()=>null},
   json:async()=>({choices:[{message:{content:'Sample safe answer'}}],
    usage:{prompt_tokens:12,completion_tokens:5}})
  };};
  const advisor=new AIAdvisor(advisorRoot,codec,{fetcher,clock});
  advisor.configure({key:'sk-or-v1-a-test-secret-token'});
  assert.strictEqual(advisor.status().budget.limit,0);
  advisor.setMonthlyRequestLimit(1);
  const first=await advisor.ask({question:'Review a website QA checklist',includeStatistics:false});
  assert.strictEqual(first.answer,'Sample safe answer');
  assert.strictEqual(advisor.status().budget.attempts,1);
  assert.strictEqual(advisor.status().budget.promptTokens,12);
  time+=8000;
  await assert.rejects(()=>advisor.ask({question:'again',includeStatistics:false}),/hết hạn mức/);
  assert.strictEqual(outbound,1,'Exhausted budget must block requests BEFORE network traffic');
  const reopened=new AIAdvisor(advisorRoot,codec,{fetcher,clock});
  assert.strictEqual(reopened.status().budget.attempts,1,'Budget holds across process restart');
  reopened.setMonthlyRequestLimit(2);
  const secondResponse=await reopened.ask({question:'again',includeStatistics:false});
  assert.strictEqual(secondResponse.answer,'Sample safe answer');
  assert.strictEqual(outbound,2);
  assert.strictEqual(reopened.status().budget.remaining,0);
  const payload=fs.readFileSync(path.join(advisorRoot,'ai-usage-budget.json'),'utf8');
  assert(!payload.includes('Review a website')&&!payload.includes('sk-or-v1'));
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/aiAdvisor.js'),'utf8');
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
  for(const id of ['ai-advisor-monthly-budget','ai-advisor-save-budget','ai-advisor-budget-status'])
   assert(html.includes('id="'+id+'"'),'Budget control missing: '+id);
  assert(ui.includes('aiAdvisorSetBudget('));
  assert(main.includes("ipcMain.handle('ai-advisor-budget-set'"));
  assert(preload.includes("ipcRenderer.invoke('ai-advisor-budget-set'"));

  const corruptRoot=fs.mkdtempSync(path.join(root,'corrupt-'));
  fs.writeFileSync(path.join(corruptRoot,'ai-usage-budget.json'),'{BAD');
  const corrupted=new AIUsageBudget(corruptRoot,{clock});
  assert.strictEqual(corrupted.status().available,false,
   'Corrupt budget must not crash the application');
  assert.throws(()=>corrupted.reserveAttempt(),/Sổ hạn mức AI bị lỗi/);
  console.log('AI monthly budget: enforcement, persistence, rollover, privacy, UI and fail-closed tests passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
