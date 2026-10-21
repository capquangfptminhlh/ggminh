// Windows-only, isolated real Camoufox smoke. No third-party browsing,
// Google sign-ins, fingerprint scores, bot evasion, or session exfiltration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Camoufox } from 'camoufox';
const exe=process.env.LHM_CAMOUFOX_EXECUTABLE;
if(process.platform!=='win32'||!exe||!path.isAbsolute(exe)||!fs.statSync(exe).isFile())
 throw Error('A SHA-256 verified upstream Windows Camoufox executable is required');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-camoufox-real-'));
const contexts=[];
const settings=id=>({
  headless:true,os:'windows',persistent_context:true,
  user_data_dir:path.join(root,'profiles',id),executable_path:exe
});
const run=async()=>{
 const alice=await Camoufox(settings('A'));
 contexts.push(alice);
 const bob=await Camoufox(settings('B'));
 contexts.push(bob);
 const aPage=await alice.newPage();
 const bPage=await bob.newPage();
 await Promise.all([
  aPage.goto('data:text/html,<h1>Local integration smoke A</h1>'),
  bPage.goto('data:text/html,<h1>Local integration smoke B</h1>')
 ]);
 assert.match(await aPage.textContent('h1'),/smoke A/);
 assert.match(await bPage.textContent('h1'),/smoke B/);
 await alice.addCookies([{name:'lhm_smoke',value:'only_profile_A',
  url:'https://example.com/',sameSite:'Lax',
  expires:Math.floor(Date.now()/1000)+3600}]);
 const storedA=await alice.cookies('https://example.com/');
 const storedB=await bob.cookies('https://example.com/');
 assert(storedA.some(c=>c.name==='lhm_smoke'&&c.value==='only_profile_A'),
  'Local test cookie missing from A');
 assert(!storedB.some(c=>c.name==='lhm_smoke'),
  'Cookie from A leaked into isolated browser context B');
 await alice.close();contexts.shift();
 const reopened=await Camoufox(settings('A'));
 contexts.push(reopened);
 const after=await reopened.cookies('https://example.com/');
 assert(after.some(c=>c.name==='lhm_smoke'&&c.value==='only_profile_A'),
  'A cookie did not persist across deliberate restart');
 await reopened.close();contexts.pop();
 await bob.close();contexts.pop();
 console.log(JSON.stringify({result:'PASS',browser:'Camoufox',
  platform:'Windows x64',contexts:2,
  concurrency:'verified',cookieIsolation:'verified',restart:'verified',
  internetNavigation:'not-run',proxy:'not-verified',
  googleAds:'not-tested',defender:process.env.LHM_CAMOUFOX_SCAN_STATUS||'unknown'}));
};
try{await run();}
finally{
 for(const c of contexts.reverse()){try{await c.close();}catch(_){}}
 fs.rmSync(root,{recursive:true,force:true});
}
