'use strict';
const assert=require('assert');
const {prepare,openInRunning}=require('../src/ops/liveNavigation');
(async()=>{
 const store={getSettings:()=>({apiEnabled:true}),
 getProfiles:()=>[
  {id:'pb_000000000001',engine:'chromium'},
  {id:'pb_000000000002',engine:'chromium'},
  {id:'pb_000000000003',engine:'gecko'},
  {id:'pb_000000000004',engine:'chromium'}
 ]};
 const active=new Map([
  ['pb_000000000001',{port:9281}],
  ['pb_000000000002',{port:9282}],
  ['pb_000000000004',{port:null}]
 ]);
 const launcher={getActive:id=>active.get(id)},calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  assert(url.startsWith('http://127.0.0.1:'));
  assert(url.includes('/json/new?https%3A%2F%2Fexample.com%2Fpage'));
  assert.strictEqual(options.method,'PUT');
  assert.strictEqual(options.redirect,'error');
  return {ok:true,status:200,json:async()=>({type:'page',id:'new-tab'})};
 };
 const ids=['pb_000000000001','pb_000000000002','pb_000000000003','pb_000000000004'];
 const result=await openInRunning(store,launcher,ids,'https://example.com/page',{fetcher});
 assert.strictEqual(result.opened,2);
 assert.strictEqual(result.results.length,4);
 assert.strictEqual(calls.length,2);
 assert.strictEqual(result.results[2].status,'gecko_unsupported');
 assert.strictEqual(result.results[3].status,'debug_port_unavailable');
 assert.throws(()=>prepare(store,launcher,[ids[0]],'file:///etc/passwd'),/http\(s\)/);
 assert.throws(()=>prepare({getSettings:()=>({apiEnabled:false}),getProfiles:store.getProfiles},
  launcher,[ids[0]],'https://example.com'),/Enable Local API/);
 const denied=await openInRunning(store,launcher,[ids[0]],'https://example.com/page',{
  fetcher:async()=>({ok:false,status:403,json:async()=>({})})
 });
 assert.strictEqual(denied.opened,0);
 assert.strictEqual(denied.results[0].status,'error');
 assert.throws(()=>prepare(store,{getActive:()=>({port:9281})},ids.slice(0,2),'https://example.com'),/Duplicate/);
 console.log('Safe active Chromium new-tab navigation, loopback isolation and failures passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
