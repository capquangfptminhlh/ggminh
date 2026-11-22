'use strict';
// Local synthetic storage smoke only. No external sites, proxy or fingerprint comparison.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {verifyPinnedTree}=require('../src/engine/camoufoxPinnedTree');
const {firefox}=require('playwright-core');
async function main(){
 const root=process.argv[2];if(!root||!path.isAbsolute(root))throw Error('Absolute candidate root required');
 const record=JSON.parse(fs.readFileSync(path.join(root,'candidate-evidence.json'),'utf8'));
 if(record.classification!=='EXPERIMENTAL_NOT_FOR_DISTRIBUTION')throw Error('Not an experimental candidate');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'candidate-manifest.json'),'utf8'));
 const verified=verifyPinnedTree(path.join(root,'engine'),manifest,record.payloadSha256);
 const testRoot=fs.mkdtempSync(path.join(root,'storage-smoke-'));
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><title>synthetic storage</title>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 const sessions=[];
 async function open(id){
  const ctx=await firefox.launchPersistentContext(path.join(testRoot,id),{executablePath:verified.executable,headless:true,timeout:120000,
   firefoxUserPrefs:{'dom.storage.flush_timeout_ms':0}});sessions.push(ctx);
  const p=await ctx.newPage();await p.goto(url);return {ctx,p};
 }
 async function read(p){return p.evaluate(()=>({cookie:document.cookie,local:localStorage.getItem('probe')}))}
 try{
  let a=await open('a'),b=await open('b');assert.deepEqual(await read(b.p),{cookie:'',local:null});
  await a.p.evaluate(()=>{document.cookie='probe=A; max-age=86400; path=/';localStorage.setItem('probe','A')});
  assert.deepEqual(await read(b.p),{cookie:'',local:null});
  await b.p.evaluate(()=>{document.cookie='probe=B; max-age=86400; path=/';localStorage.setItem('probe','B')});
  assert.deepEqual(await read(a.p),{cookie:'probe=A',local:'A'});
  await a.ctx.close();await b.ctx.close();a=await open('a');
  assert.deepEqual(await read(a.p),{cookie:'probe=A',local:'A'});await a.ctx.close();
  const result={result:'PASS',scope:'local headless synthetic storage smoke',candidatePayload:record.payloadSha256,
   twoConcurrentProfiles:true,cookie:true,localStorage:true,restart:true,network:'loopback only',releaseAcceptance:'NOT_RUN'};
  fs.writeFileSync(path.join(root,'storage-smoke-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
 }finally{for(const ctx of sessions)await ctx.close().catch(()=>{});await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
