'use strict';
const assert=require('assert');
const {evaluate,inspectContext}=require('../../src/engine/NetworkSafetyCheck');
(async()=>{
 const direct={proxy:{type:'direct'}};
 assert.strictEqual(evaluate(direct).safeToLaunch,true);
 const bad={proxy:{type:'socks5',host:'proxy.example',port:1080,authProxyId:'secret'}};
 assert.strictEqual(evaluate(bad).safeToLaunch,false);
 const store={data:{proxies:[{id:'secret',type:'socks5',
  host:'proxy.example',port:1080}]}};
 const vault={get:()=>({user:'local',pass:'vault-secret'})};
 assert.strictEqual(evaluate(bad,{labApproved:true,store,proxyVault:vault}).safeToLaunch,true);
 let closed=0,evaluated=0;
 const ctx={newPage:async()=>({
  goto:async()=>{},close:async()=>{closed++},
  evaluate:async()=>{evaluated++;return [
   'candidate:1 1 UDP 111 198.51.100.99 12345 typ srflx',
   'candidate:2 1 UDP 111 8.8.8.8 23456 typ srflx'
  ]}
 })};
 const unknown=await inspectContext(ctx);
 assert.strictEqual(unknown.result,'NOT_RUN');
 assert.strictEqual(evaluated,0);
 const leak=await inspectContext(ctx,{stunServer:'stun:lab.example:3478',
  expectedEgressIPv4:'203.0.113.1'});
 assert.strictEqual(leak.result,'FAILED');
 assert.strictEqual(leak.dns,'NOT_TESTED');
 assert.strictEqual(closed,1);
 assert.strictEqual(evaluated,1);
 const safeLooking={newPage:async()=>({
  goto:async()=>{},close:async()=>{},
  evaluate:async()=>[]
 })};
 const inconclusive=await inspectContext(safeLooking,{
  stunServer:'stun:lab.example:3478',expectedEgressIPv4:'203.0.113.1'});
 assert.strictEqual(inconclusive.result,'INCONCLUSIVE');
 console.log('Preflight, browser-context STUN observation and DNS-unknown safety states passed (mocked lab)');
})().catch(e=>{console.error(e);process.exitCode=1});