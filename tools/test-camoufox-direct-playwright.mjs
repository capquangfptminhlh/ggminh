// An upstream *compatibility experiment*; not an installed LHM release,
// automation product integration or proxy/WebRTC leak certification.
// Must run with pinned, SHA-256 checked upstream browser on Windows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { firefox } from 'playwright-core';
import cleanup from './synthetic-profile-cleanup.js';
const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
if(process.platform!=='win32'||!exe||!path.isAbsolute(exe)||
   path.basename(exe).toLowerCase()!=='camoufox.exe'||!fs.statSync(exe).isFile())
 throw Error('Official verified Windows camoufox.exe required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-playwright-'));
let a,b,runError=null,cleanupError=null,targetHits=0,proxyHits=0;
const target=http.createServer((_req,res)=>{targetHits++;res.end('synthetic direct fallback');});
const refusingProxy=net.createServer(socket=>{proxyHits++;socket.destroy();});
await Promise.all([target,refusingProxy].map(server=>new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
})));
try{
 a=await firefox.launchPersistentContext(path.join(root,'A'),{
  executablePath:exe,headless:true,timeout:25000
 });
 const pa=await a.newPage();
 await pa.goto('about:blank');
 b=await firefox.launchPersistentContext(path.join(root,'B'),{
  executablePath:exe,headless:true,timeout:25000
 });
 const pb=await b.newPage();
 await pb.goto('data:text/html,<title>Playwright isolated B</title>');
 assert.equal(await pb.title(),'Playwright isolated B');
 assert.notEqual(path.join(root,'A'),path.join(root,'B'));
 // The local proxy refuses connections. If a direct fallback occurs, the
 // local target records it. No external URL, DNS or STUN endpoint is used.
 let failureObserved=false,proxy;
 try{
  proxy=await firefox.launchPersistentContext(path.join(root,'bad-proxy'),{
   executablePath:exe,headless:true,timeout:25000,
   proxy:{server:'http://127.0.0.1:'+refusingProxy.address().port},
   firefoxUserPrefs:{'network.proxy.allow_hijacking_localhost':true,
    'network.proxy.no_proxies_on':''},
  });
  const p=await proxy.newPage();
  try{await p.goto('http://127.0.0.1:'+target.address().port+'/',{timeout:12000});}
  catch(_){failureObserved=true;}
 }finally{if(proxy)await proxy.close();}
 assert(failureObserved,'An unreachable local HTTP proxy unexpectedly allowed direct browsing');
 assert(proxyHits>0,'Browser never connected to the synthetic refusing proxy');
 assert.equal(targetHits,0,'Browser connected directly to the local target');
}catch(error){runError=error;
}finally{
 for(const context of [a,b])if(context)try{await context.close();}catch(error){cleanupError??=error;}
 for(const server of [target,refusingProxy])await new Promise(resolve=>server.close(resolve));
 // A rejected Playwright launch may not have returned a context. Wait until
 // processes for these exact synthetic profiles exit before deleting them.
 try{await cleanup.removePlaywrightFixture(root);}
 catch(error){cleanupError??=error;}
}
if(runError&&cleanupError)throw new AggregateError([runError,cleanupError],
 'Compatibility test and synthetic cleanup both failed: '+runError.message+'; '+cleanupError.message);
if(runError)throw runError;
if(cleanupError)throw cleanupError;
console.log(JSON.stringify({result:'PASS',node:process.versions.node,
 browser:'official-upstream-camoufox',driver:'playwright-core.firefox',
 persistence:'launchPersistentContext',contexts:2,aboutBlank:true,
 independentProfiles:true,deadLocalProxy:'navigation-blocked',proxyReached:true,
 directLocalTargetReached:false,syntheticProfileCleanup:'PASS',
 externalPlaywrightEndpoint:'none',realProxyCredentials:'NOT_TESTED',
 dns:'NOT_TESTED',webrtc:'NOT_TESTED',commercialLhmExe:'NOT_TESTED'}));
