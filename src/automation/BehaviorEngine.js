'use strict';
/**
 * Retry and resource pacing for authorized maintenance workflows.
 * NOT synthetic human input, fatigue emulation, CAPTCHA or ad-account
 * warm-up. Never sends mouse/keyboard events.
 */
const crypto=require('crypto');
const ALLOWED=new Set(['rate_limit','service_busy','resource_budget']);
class BehaviorEngine{
 constructor(page,behaviorConfig={},sessionStartTime=Date.now(),{
  now=()=>Date.now(),wait=null
 }={}){
  if(!Number.isSafeInteger(sessionStartTime))throw Error('Invalid session start');
  if(!behaviorConfig||typeof behaviorConfig!=='object'||Array.isArray(behaviorConfig))
   throw Error('Invalid delay policy');
  this.page=page;this.config=behaviorConfig;this.sessionStartTime=sessionStartTime;this.now=now;
  this.wait=wait||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 }
 async smartDelay(baseDelayMs,{reason='rate_limit',attempt=0}={}){
  if(!ALLOWED.has(reason))throw Error('Delay reason not allowed');
  if(!Number.isSafeInteger(baseDelayMs)||baseDelayMs<100||baseDelayMs>60000)
   throw Error('Delay must be 100–60,000 ms');
  if(!Number.isInteger(attempt)||attempt<0||attempt>8)throw Error('Invalid retry number');
  // Bounded exponential backoff reduces retry storms. 0-10% positive jitter
  // de-synchronizes agents but does not imitate biological input timings.
  const base=Math.min(60000,baseDelayMs*Math.pow(2,attempt));
  const jitter=crypto.randomInt(0,1001)/10000;
  const finalDelay=Math.max(100,Math.min(60000,Math.ceil(base*(1+jitter))));
  await this.wait(finalDelay);
  return {waitedMs:finalDelay,reason,attempt,simulatedHuman:false};
 }
}
module.exports={BehaviorEngine};
