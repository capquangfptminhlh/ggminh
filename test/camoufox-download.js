'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs'),os=require('os'),path=require('path');
const {EventEmitter}=require('events');
const {Readable}=require('stream');
const {downloadPinned}=require('../src/engine/camoufoxInstallService');

(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-download-test-'));
 const payload=Buffer.from('LHM signed release fixture: this is not executable material');
 const digest=crypto.createHash('sha256').update(payload).digest('hex');
 const github='https://github.com/owner/release/releases/download/v1/engine.zip';
 const cdn='https://release-assets.githubusercontent.com/tokenized?download=1';
 const fakeRequest=entries=>(url,opts,cb)=>{
  const req=new EventEmitter();
  req.destroy=(error)=>req.emit('error',error);
  process.nextTick(()=>{
   const responseSpec=entries.shift();
   if(!responseSpec)return req.emit('error',Error('Unexpected download request'));
   if(responseSpec.uri)assert.strictEqual(String(url),responseSpec.uri);
   assert.strictEqual(url.protocol,'https:');
   const body=responseSpec.body||Buffer.alloc(0);
   const response=Readable.from(body.length?[body]:[]);
   response.statusCode=responseSpec.status;
   response.headers=responseSpec.headers||{};
   cb(response);
  });
  return req;
 };
 try{
  const target=path.join(root,'good.zip');
  const fixture=[
   {uri:github,status:302,headers:{location:cdn}},
   {uri:cdn,status:200,body:payload,headers:{'content-length':String(payload.length)}}
  ];
  const result=await downloadPinned(github,target,{sha256:digest,bytes:payload.length},fakeRequest(fixture));
  assert.strictEqual(result.sha256,digest);
  assert.deepStrictEqual(fs.readFileSync(target),payload);
  assert.strictEqual(fixture.length,0);
  const bad=path.join(root,'tampered.zip');
  await assert.rejects(()=>downloadPinned(github,bad,{
   sha256:'0'.repeat(64),bytes:payload.length
  },fakeRequest([{status:200,body:payload}])),/SHA-256/);
  const oversize=path.join(root,'oversized.zip');
  await assert.rejects(()=>downloadPinned(github,oversize,{
   sha256:digest,bytes:payload.length-1
  },fakeRequest([{status:200,body:payload}])),/size limit|SHA-256|length/);
  const redirect=path.join(root,'redirect.zip');
  await assert.rejects(()=>downloadPinned(github,redirect,{
   sha256:digest,bytes:payload.length
  },fakeRequest([{status:302,headers:{location:'http://evil.example/archive.zip'}}])),/not trusted/);
  const http500=path.join(root,'failed.zip');
  await assert.rejects(()=>downloadPinned(github,http500,{
   sha256:digest,bytes:payload.length
  },fakeRequest([{status:500}])),/HTTP 500/);
  console.log('Pinned HTTPS download: allowed release CDN, SHA tampering, length limit, HTTP rejection and redirect restrictions passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
