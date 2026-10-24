'use strict';
/**
 * Bounded Stage-0 real-engine operations. A timeout is FAIL/NOT_RUN,
 * never fabricated isolation evidence. Diagnostic stages have no secrets.
 */
function runStage(name,task,ms=90000){
 if(typeof name!=='string'||!/^[-a-zA-Z0-9_ ]{3,100}$/.test(name)||
    typeof task!=='function'||!Number.isSafeInteger(ms)||ms<20||ms>180000)
  throw Error('Invalid Stage-0 diagnostic stage');
 const t=Date.now();
 let timer;
 console.error('[Stage-0] start:',name);
 return Promise.race([
  Promise.resolve().then(task),
  new Promise((_,reject)=>{
   timer=setTimeout(()=>reject(Error('Stage-0 operation timed out: '+name)),ms);
  })
 ]).then(value=>{console.error('[Stage-0] PASS:',name,Date.now()-t+'ms');return value;},
  error=>{console.error('[Stage-0] FAIL:',name,Date.now()-t+'ms',String(error?.message||error).slice(0,140));throw error;})
 .finally(()=>clearTimeout(timer));
}
// Guard unexpected open handles/Playwright stalls. Always fail (exit 2).
function startHardDeadline(ms=9*60*1000){
 let completed=false;
 const timer=setTimeout(()=>{
  if(completed)return;
  console.error('[Stage-0] FAIL: process exceeded hard lab deadline; no PASS evidence permitted');
  process.exit(2);
 },ms);
 timer.unref?.();
 return ()=>{completed=true;clearTimeout(timer);};
}
module.exports={runStage,startHardDeadline};
