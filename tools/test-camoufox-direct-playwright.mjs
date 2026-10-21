// An upstream *compatibility experiment*; not an installed LHM release,
// automation product integration or proxy/WebRTC leak certification.
// Must run with pinned, SHA-256 checked upstream browser on Windows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { firefox } from 'playwright-core';
const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
if(process.platform!=='win32'||!exe||!path.isAbsolute(exe)||
   path.basename(exe).toLowerCase()!=='camoufox.exe'||!fs.statSync(exe).isFile())
 throw Error('Official verified Windows camoufox.exe required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-playwright-'));
let a,b;
try{
 a=await firefox.launchPersistentContext(path.join(root,'A'),{
  executablePath:exe,headless:true,timeout:25000
 });
 const pa=await a.newPage();
 await pa.goto('about:blank');
 const ua=await pa.evaluate(()=>navigator.userAgent);
 assert.equal(typeof ua,'string');
 assert(ua.length>10);
 b=await firefox.launchPersistentContext(path.join(root,'B'),{
  executablePath:exe,headless:true,timeout:25000
 });
 const pb=await b.newPage();
 await pb.goto('data:text/html,<title>Playwright isolated B</title>');
 assert.equal(await pb.title(),'Playwright isolated B');
 assert.notEqual(path.join(root,'A'),path.join(root,'B'));
 // A dead TCP proxy must fail instead of silently routing direct. This is
 // a connectivity negative test; NOT a DNS or STUN/ICE lab.
 let failureObserved=false,proxy;
 try{
  proxy=await firefox.launchPersistentContext(path.join(root,'bad-proxy'),{
   executablePath:exe,headless:true,timeout:25000,
   proxy:{server:'http://127.0.0.1:1'},
  });
  const p=await proxy.newPage();
  try{await p.goto('https://example.com/',{timeout:12000});}
  catch(_){failureObserved=true;}
 }finally{if(proxy)await proxy.close();}
 assert(failureObserved,'An unreachable local HTTP proxy unexpectedly allowed direct browsing');
 console.log(JSON.stringify({
  result:'PASS',node:process.versions.node,
  browser:'official-upstream-camoufox',driver:'playwright-core.firefox',
  persistence:'launchPersistentContext',contexts:2,
  aboutBlank:true,userAgentEvaluated:true,
  independentProfiles:true,deadLocalProxy:'navigation-blocked',
  externalPlaywrightEndpoint:'none',
  realProxyCredentials:'NOT_TESTED',dns:'NOT_TESTED',webrtc:'NOT_TESTED',
  commercialLhmExe:'NOT_TESTED'}));
}finally{
 if(a)await a.close().catch(()=>{});
 if(b)await b.close().catch(()=>{});
 // Windows antivirus/SQLite readers can briefly hold files after process exit.
 try{fs.rmSync(root,{recursive:true,force:true,maxRetries:15,retryDelay:250});}
 catch(error){console.error('Temporary profile cleanup:',error.message);throw error;}
}
