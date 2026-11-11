'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {
 parseArgs,shapeReport,assertPrivacySafeReport,workloadHtml,createWorkloadServer
}=require('../tools/browser-resource-benchmark');

const samples=Array.from({length:10},(_,index)=>({
 startupMs:100+index,peakWorkingSetBytes:500_000_000+index*1_000_000,
 peakCpuPercent:20+index,crashed:index===9,cleanupOk:true,
 forbiddenProfileName:'Customer Secret',url:'https://secret.example/account',
 proxy:{password:'DO_NOT_LEAK'},token:'DO_NOT_LEAK',cookies:['DO_NOT_LEAK'],
 identity:{env:{CAMOU_CONFIG_1:'DO_NOT_LEAK'}}
}));
const report=shapeReport({
 commit:'a'.repeat(40),appSha256:'b'.repeat(64),engineSha256:'c'.repeat(64),
 appVersion:'5.8.0',engineVersion:'Camoufox 0.5.8',windowsBuild:'10.0.26100',
 totalRamBytes:16*1024**3,engine:'camoufox',workload:'medium',concurrency:3,
 generatedAt:'2026-11-10T01:02:03.000Z',samples,
 cleanup:{status:'PASS',remainingPids:0}
});
assert.equal(report.schema,'lhm.browser-resource.evidence.v1');
assert.equal(report.samples.length,10);
assert.equal(report.metrics.startupMs.p50,104);
assert.equal(report.metrics.startupMs.p95,109);
assert.equal(report.metrics.workingSetBytes.p95,509_000_000);
assert.equal(report.metrics.peakCpuPercent,29);
assert.equal(report.crashCount,1);
assert.equal(report.cleanup.status,'PASS');
assertPrivacySafeReport(report);
assert.throws(()=>assertPrivacySafeReport({...report,profileName:'secret'}),
 /Forbidden report field/);
const serialized=JSON.stringify(report);
for(const secret of ['Customer Secret','secret.example','DO_NOT_LEAK','CAMOU_CONFIG'])
 assert(!serialized.includes(secret),'Report leaked '+secret);
assert.throws(()=>shapeReport({
 commit:'a'.repeat(40),appSha256:'b'.repeat(64),engineSha256:'c'.repeat(64),
 windowsBuild:'10.0.1',totalRamBytes:8*1024**3,engine:'chromium',
 workload:'light',concurrency:1,samples:samples.slice(0,9),
 cleanup:{status:'PASS',remainingPids:0}
}),/at least 10/);
assert.deepEqual(parseArgs(['--engine','chromium','--binary','C:\\Browser\\chrome.exe',
 '--app-artifact','C:\\LHM\\app.asar','--workload','heavy','--concurrency','5',
 '--samples','12','--output','C:\\evidence\\report.json'],{platform:'win32'}),{
 engine:'chromium',binary:'C:\\Browser\\chrome.exe',appArtifact:'C:\\LHM\\app.asar',
 workload:'heavy',concurrency:5,samples:12,output:'C:\\evidence\\report.json',
 signedReleaseDir:null,publisherKeyDir:null,identityFile:null,durationMs:3000
});
assert.throws(()=>parseArgs(['--engine','camoufox','--binary','C:\\bad.exe',
 '--app-artifact','C:\\app.asar','--output','C:\\out.json'],{platform:'win32'}),
 /signed-release-dir/);
assert.equal(parseArgs(['--engine','camoufox',
 '--app-artifact','C:\\LHM\\setup.exe','--signed-release-dir','D:\\engine',
 '--publisher-key-dir','C:\\LHM\\resources','--identity-file','D:\\identities.json',
 '--output','D:\\report.json'],{platform:'win32'}).publisherKeyDir,
 'C:\\LHM\\resources');
for(const kind of ['light','medium','heavy']){
 const html=workloadHtml(kind,'sample-id');
 assert(html.includes('sample-id'));
 assert(!/https?:\/\/(?!127\.0\.0\.1)/.test(html));
}
const guide=fs.readFileSync(path.join(__dirname,
 '../docs/acceptance/BROWSER_RESOURCE_BENCHMARK.md'),'utf8');
assert(guide.includes('8 GB | UNMEASURED'));
assert(guide.includes('--signed-release-dir'));
assert(guide.includes('không ghi đè'));
(async()=>{
 const server=createWorkloadServer();
 const port=await server.listen();
 try{
  const run='loopback-test';
  const page=await fetch('http://127.0.0.1:'+port+'/light?run='+run);
  assert.equal(page.status,200);
  assert((await page.text()).includes(run));
  const ready=await fetch('http://127.0.0.1:'+port+'/ready?run='+run);
  assert.equal(ready.status,204);
  assert(server.ready.has(run));
 }finally{await server.close()}
 console.log('Browser resource benchmark schema, privacy allowlist and fixed loopback workloads passed');
})().catch(error=>{console.error(error);process.exitCode=1});
