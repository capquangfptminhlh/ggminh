#!/usr/bin/env node
'use strict';
// Offline owner operator -> Cloudflare Worker admin API over HTTPS.
// No token or admin credential is printed or written to disk by this tool.
const fs=require('fs');
function endpoint(value){
 if(typeof value!=='string')throw Error('Supply --url HTTPS authority base');
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   url.pathname!=='/'||!url.hostname)throw Error('Admin authority base must be HTTPS root URL');
 return url.origin;
}
function parse(argv){
 const command=argv[0];
 if(!['register','revoke','allow','health'].includes(command))
  throw Error('Usage: register|revoke|allow|health --url https://authority.example [--license-id lic_...]');
 const urlIndex=argv.indexOf('--url');
 if(urlIndex===-1||!argv[urlIndex+1])throw Error('Missing --url');
 const base=endpoint(argv[urlIndex+1]);
 const idIndex=argv.indexOf('--license-id'),licenseId=idIndex>=0?argv[idIndex+1]:null;
 if(['revoke','allow'].includes(command)&&!/^lic_[a-f0-9]{24}$/.test(licenseId||''))
  throw Error('Supply valid --license-id');
 const expected=['--url',argv[urlIndex+1],...(licenseId?['--license-id',licenseId]:[])];
 if(argv.length!==expected.length+1)throw Error('Unexpected arguments');
 return {command,base,licenseId};
}
async function run(argv=process.argv.slice(2),{
  env=process.env,fetcher=globalThis.fetch,readStdin=()=>fs.readFileSync(0,'utf8')
}={}){
 const {command,base,licenseId}=parse(argv);
 const health=command==='health';
 const admin=env.LHM_LICENSE_ADMIN_TOKEN;
 if(!health&&(!admin||admin.length<32))
  throw Error('LHM_LICENSE_ADMIN_TOKEN must be in a private environment variable (32+ chars)');
 const tail=health?'/health':command==='register'?'/v1/admin/register':'/v1/admin/revocation';
 let body;
 if(command==='register'){
  // Token on stdin to avoid shell history, args and filesystem copies.
  // Keep stdout redirected only to a private approved location.
  const token=readStdin().trim();
  if(!/^lhmlic1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)||token.length>11000)
   throw Error('Expected a signed license token on stdin');
  body={token};
 }else if(!health)body={licenseId,revoked:command==='revoke'};
 const response=await fetcher(base+tail,{
  method:health?'GET':'POST',redirect:'error',
  signal:AbortSignal.timeout(10000),
  headers:health?{'Accept':'application/json'}:{
   'Content-Type':'application/json','Accept':'application/json',
   'Authorization':'Bearer '+admin
  },...(body?{body:JSON.stringify(body)}:{})
 });
 if(!response?.ok)throw Error('Authority '+command+' failed: HTTP '+response?.status);
 const reply=await response.json();
 // Fixed allowlist only. Never display the token, D1 endpoint internals
 // or raw body from the remote server.
 if(health)return {status:reply.status==='ok'?'ok':'degraded'};
 if(command==='register')return {registered:reply.registered===true,
  licenseId:reply.licenseId,revoked:reply.revoked===true};
 return {licenseId:reply.licenseId,revoked:reply.revoked===true};
}
if(require.main===module)run().then(x=>{console.log(JSON.stringify(x));})
 .catch(e=>{console.error('License Cloudflare sync:',e.message);process.exitCode=1;});
module.exports={run,parse,endpoint};
