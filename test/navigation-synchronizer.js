'use strict';
const assert=require('assert');
const {NavigationSynchronizer,allowedHosts,safeUrl}=require('../src/ops/navigationSynchronizer');
(async()=>{
 const allow=allowedHosts('example.com,second.org');
 assert.strictEqual(safeUrl('https://example.com/next?token=abc#secret',allow),'https://example.com/next');
 assert.strictEqual(safeUrl('https://evil.example.com/page',allow),null);
 assert.strictEqual(safeUrl('http://example.com/page',allow),null);
 assert.strictEqual(safeUrl('https://user:pass@example.com',allow),null);
 for(const s of ['', '*.example.com','127.0.0.1','localhost','foo..bar'])
  assert.throws(()=>allowedHosts(s));
 const profiles=[1,2,3].map(n=>({id:'pb_'+n,engine:'chromium'}));
 const active=new Map(profiles.map((p,i)=>[p.id,{port:9200+i}]));
 const store={getSettings:()=>({apiEnabled:true}),getProfiles:()=>profiles};
 const launcher={getActive:id=>active.get(id)};
 const calls=[];let url='https://example.com/home';
 const sync=new NavigationSynchronizer(store,launcher,{
  intervalMs:100000,
  fetcher:async(endpoint,opts)=>{
   assert.strictEqual(endpoint,'http://127.0.0.1:9200/json');
   assert.strictEqual(opts.redirect,'error');
   return {ok:true,json:async()=>[{type:'page',id:'tab1',url}]};
  },
  opener:async(_store,_launcher,ids,target)=>{
   calls.push({ids,target});return {opened:ids.length};
  }
 });
 assert.throws(()=>sync.start({masterId:'pb_1',followerIds:['pb_1'],hosts:'example.com'}));
 sync.start({masterId:'pb_1',followerIds:['pb_2','pb_3'],hosts:'example.com'});
 await sync.poll();assert.strictEqual(calls.length,0);
 url='https://example.com/path?auth=private#id';
 await sync.poll();
 assert.strictEqual(calls.length,1);
 assert.strictEqual(calls[0].target,'https://example.com/path');
 await sync.poll();assert.strictEqual(calls.length,1);
 url='https://other.org/not-allowed';
 await sync.poll();assert.strictEqual(calls.length,1);
 sync.stop();url='https://example.com/later';
 await sync.poll();assert.strictEqual(calls.length,1);
 active.delete('pb_3');
 assert.throws(()=>sync.start({masterId:'pb_1',followerIds:['pb_2','pb_3'],
  hosts:'example.com'}),/active Chromium/);
 console.log('NavigationSynchronizer opt-in, domain isolation, de-duplication and stop passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
