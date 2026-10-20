'use strict';
const assert=require('assert');
const {options,request,main}=require('../bin/lhm-cli');
(async()=>{
 const env={LHM_API_KEY:'sample-local-api-key',LHM_API_PORT:'50325'};
 assert.throws(()=>options(['invalid'],env),/Usage/);
 assert.throws(()=>options(['start'],env),/Usage/);
 assert.throws(()=>options(['start','../../../etc'],env),/Invalid/);
 assert.throws(()=>options(['status'],{}),/LHM_API_KEY/);
 assert.throws(()=>options(['status'],{...env,LHM_API_PORT:'1'}),/LHM_API_PORT/);
 const calls=[];
 const fetcher=async(uri,args)=>{
  calls.push(uri.toString());
  assert.strictEqual(uri.hostname,'127.0.0.1');
  assert.strictEqual(args.headers['X-API-Key'],env.LHM_API_KEY);
  assert.strictEqual(args.redirect,'error');
  return {status:200,ok:true,json:async()=>({code:0,data:{list:[{id:'sample'}]}})};
 };
 await request(options(['list'],env),fetcher);
 await request(options(['start','pb_abcdef012345'],env),fetcher);
 await request(options(['stop','pb_abcdef012345'],env),fetcher);
 assert(calls[1].includes('/api/v1/browser/start?user_id=pb_abcdef012345'));
 assert(calls[2].includes('/api/v1/browser/stop?user_id=pb_abcdef012345'));
 assert((await main(['status'],env,fetcher)).includes('"code": 0'));
 await assert.rejects(()=>request(options(['list'],env),async()=>({
  ok:false,status:401,json:async()=>({code:-1,msg:'Unauthorized'})
 })),/401/);
 console.log('v4.1 local CLI authentication, loopback routing, validation and commands passed');
})().catch(e=>{console.error(e);process.exitCode=1;});