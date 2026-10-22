'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Store=require('../src/db/store');
const {runPerformanceLab,timedSamples,percentile}=require('../src/ops/performanceLab');
const {parseArgs,generateProfiles,measureSynthetic}=require('../tools/profile-scale-benchmark');

assert.equal(percentile([1,2,3,4,5],.5),3);
assert.equal(percentile([1,2,3,4,5],.95),5);
let tick=0;
const timing=timedSamples(()=>{},5,()=>++tick);
assert.equal(timing.samples,5);
assert.equal(timing.p95Ms,1);
assert.throws(()=>runPerformanceLab(null),/read-only/);
for(const n of [0,4,31,1.5])assert.throws(()=>runPerformanceLab({
 getProfiles:()=>[],getProfile:()=>null
},{iterations:n}),/5–30/);
assert.deepEqual(parseArgs([]).sizes,[100,500,1000]);
assert.deepEqual(parseArgs(['--sizes','10,100','--iterations','8']).sizes,[10,100]);
assert.throws(()=>parseArgs(['--sizes','0']),/Allowed sizes/);
assert.throws(()=>parseArgs(['--sizes','5001']),/Allowed sizes/);
assert.throws(()=>parseArgs(['--sizes','50,50']),/Allowed sizes/);
assert.throws(()=>parseArgs(['--output','oops.txt']),/JSON/);
assert.equal(generateProfiles(7).length,7);
assert.notEqual(generateProfiles(2)[0].id,generateProfiles(2)[1].id);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-perf-smoke-'));
try {
  const store=new Store(root);
  const privateName='SUPER_PRIVATE_CUSTOMER_NAME';
  const privateNote='SUPER_SECRET_PASSWORD_OR_COOKIE';
  store.data.profiles=generateProfiles(20);
  store.data.profiles[0].name=privateName;
  store.data.profiles[0].notes=privateNote;
  store.data.profiles[0].startUrl='https://private.example/SECRET_CRM_ID?access_token=SECRET123';
  store.saveData();
  const before=fs.readFileSync(store.dbFile);
  const result=runPerformanceLab(store,{iterations:5,generatedAt:()=> '2026-10-23T00:00:00.000Z'});
  assert.equal(result.profileCount,20);
  assert.equal(result.lookupBatchSize,20);
  assert.equal(result.status,'MEASURED_LOCAL_ONLY');
  assert(result.operations.listAllProfiles.samples===5);
  assert(result.operations.dashboardProjection.p95Ms>=0);
  assert.equal(result.scope,'local_profile_metadata_only');
  const serialized=JSON.stringify(result);
  for(const secret of [privateName,privateNote,'SECRET_CRM_ID','SECRET123',
    store.data.profiles[0].id,'private.example'])assert(!serialized.includes(secret),
    'Real profile data must never escape performance report');
  assert.deepEqual(fs.readFileSync(store.dbFile),before,'Benchmark must not modify profile database');
  assert.throws(()=>runPerformanceLab({
    getProfiles:()=>Array(10001).fill({id:'s'}),
    getProfile:()=>null
  },{iterations:5}),/10,000/);
  const synthetic=measureSynthetic(50,5);
  assert.equal(synthetic.profileCount,50);
  assert(synthetic.dbFileSizeBytes>0&&synthetic.coldLoadMs>=0);
  assert.equal(synthetic.metrics.listAllProfiles.samples,5);

  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  const preload=fs.readFileSync(path.join(__dirname,'../preload.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../src/ui/index.html'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../src/ui/performanceLab.js'),'utf8');
  assert(main.includes("ipcMain.handle('performance-lab-run'"));
  assert(main.includes("ipcMain.handle('performance-lab-export'"));
  assert(main.includes('dialog.showSaveDialog(mainWindow'));
  assert(preload.includes('runPerformanceLab'));
  assert(preload.includes('exportPerformanceLab'));
  for(const id of ['btn-performance-lab','modal-performance-lab','performance-lab-run',
    'performance-lab-export','performance-lab-metrics']){
    assert(html.includes('id="'+id+'"'),'Missing Performance Lab UI element: '+id);
  }
  assert(html.includes('src="performanceLab.js"'));
  assert(html.includes('href="performanceLab.css"'));
  assert(!ui.includes('innerHTML'),'Never render customer data as unsanitized HTML');
  console.log('LHM Performance Lab: measured local profile operations, privacy, synthetic metrics and UI wiring PASS');
} finally {fs.rmSync(root,{recursive:true,force:true});}
