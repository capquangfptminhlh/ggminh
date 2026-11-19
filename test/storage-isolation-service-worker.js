'use strict';
const assert=require('node:assert/strict');
const {inspectServiceWorker}=require('../tools/storage-isolation-service-worker');
const location={origin:'http://127.0.0.1:1234'};
function fixture(){
 let current=[];
 const sw={getRegistrations:async()=>current,register:async(url,options)=>{
  assert.equal(options.scope,'/lhm-isolation/');
  current=[{scope:location.origin+options.scope,active:{scriptURL:location.origin+url,state:'activated'}}];return current[0];
 }};
 return {sw,set:value=>{current=value}};
}
(async()=>{
 const a=fixture(),b=fixture();
 assert.deepEqual(await inspectServiceWorker({serviceWorker:a.sw},location,'set','A'),{supported:true,registration:'A'});
 assert.deepEqual(await inspectServiceWorker({serviceWorker:b.sw},location,'read',null),{supported:true,registration:null});
 assert.deepEqual(await inspectServiceWorker({serviceWorker:b.sw},location,'set','B'),{supported:true,registration:'B'});
 assert.deepEqual(await inspectServiceWorker({serviceWorker:a.sw},location,'read',null),{supported:true,registration:'A'});
 const old={scriptURL:location.origin+'/lhm-worker.js?owner=A',state:'activated'},next={scriptURL:location.origin+'/lhm-worker.js?owner=B',state:'activated'};
 let reads=0;const updating={scope:location.origin+'/lhm-isolation/'};
 Object.defineProperty(updating,'active',{get(){return ++reads>2?next:old}});
 const updateNav={serviceWorker:{register:async()=>updating,getRegistrations:async()=>[updating]}};
 assert.equal((await inspectServiceWorker(updateNav,location,'set','B')).registration,'B');
 const stale={scope:location.origin+'/lhm-isolation/',active:old};
 const staleNav={serviceWorker:{register:async()=>stale,getRegistrations:async()=>[stale]}};
 await assert.rejects(inspectServiceWorker(staleNav,location,'set','B',{timeoutMs:30,pollMs:5}),/activation timeout/);
 b.set([{scope:location.origin+'/lhm-isolation/',active:{scriptURL:'http://untrusted.test/lhm-worker.js?owner=A',state:'activated'}}]);
 assert.equal((await inspectServiceWorker({serviceWorker:b.sw},location,'read',null)).registration,'unexpected');
 b.set([{scope:location.origin+'/lhm-isolation/',active:null}]);
 assert.equal((await inspectServiceWorker({serviceWorker:b.sw},location,'read',null)).registration,'unexpected');
 b.set([{scope:location.origin+'/lhm-isolation/',active:{scriptURL:location.origin+'/lhm-worker.js?owner=B',state:'activated'}},
  {scope:location.origin+'/other/',active:{scriptURL:location.origin+'/other.js',state:'activated'}}]);
 assert.equal((await inspectServiceWorker({serviceWorker:b.sw},location,'read',null)).registration,'unexpected');
 assert.deepEqual(await inspectServiceWorker({},location,'read',null),{supported:false,registration:null});
 await assert.rejects(inspectServiceWorker({serviceWorker:a.sw},location,'set','C'));
 console.log('Synthetic Service Worker registration inspection PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
