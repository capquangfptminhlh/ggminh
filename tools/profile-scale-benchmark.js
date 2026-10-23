'use strict';
/**
 * Reproducible SYNTHETIC 100/500/1000 profile local metadata benchmark.
 *
 * Never contacts the internet, launches browsers, runs ads or reads real
 * customer data. Output is observational; no invented AdsPower metrics.
 * Usage:
 * node tools/profile-scale-benchmark.js --sizes 100,500,1000 --iterations 12 --output path/to/report.json
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const Store=require('../src/db/store');
const {runPerformanceLab}=require('../src/ops/performanceLab');

function parseArgs(argv) {
  const out={sizes:[100,500,1000],iterations:12,output:null};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--sizes') {
      if(!argv[i+1])throw Error('Missing sizes');
      const items=argv[++i].split(',').map(Number);
      if(!items.length||items.length>5||items.some(n=>!Number.isInteger(n)||n<1||n>5000) ||
          new Set(items).size!==items.length)throw Error('Allowed sizes: up to five unique values, each 1–5000');
      out.sizes=items;
    } else if(arg==='--iterations') {
      const val=Number(argv[++i]);
      if(!Number.isInteger(val)||val<5||val>30)throw Error('Iterations must be 5–30');
      out.iterations=val;
    } else if(arg==='--output') {
      if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Missing output filename');
      out.output=path.resolve(argv[++i]);
      if(!out.output.toLowerCase().endsWith('.json'))throw Error('Output must be a JSON file');
    } else throw Error('Unsupported argument: '+arg);
  }
  return out;
}
function generateProfiles(n) {
  return Array.from({length:n},(_,i)=>({
    id:'pb_synthetic_'+String(i+1).padStart(6,'0'),
    name:'Synthetic '+(i+1),
    group:'Test Group '+((i%10)+1),
    engine:'chromium',engine_type:'chromium',
    startUrl:'https://example.com/',
    startUrls:['https://example.com/'],
    tags:[],notes:'',proxy:{type:'direct'},fingerprint:{mode:'native'},
    createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'
  }));
}
function measureSynthetic(n,iterations) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-perf-synthetic-'));
  try {
    const store=new Store(directory);
    const fixtures=generateProfiles(n);
    store.data.profiles=fixtures;
    store.saveData(); // one representative on-disk metadata file
    const fileSize=fs.statSync(store.dbFile).size;
    const started=performance.now();
    const reloaded=new Store(directory);
    const openMs=Math.round((performance.now()-started)*1000)/1000;
    const report=runPerformanceLab(reloaded,{iterations});
    if(report.profileCount!==n)throw Error('Unexpected profile count');
    // Results are numeric only. No filenames or source profile content.
    return {profileCount:n,dbFileSizeBytes:fileSize,coldLoadMs:openMs,
      metrics:report.operations,processRssMiB:report.environment.processRssMiB};
  } finally {
    fs.rmSync(directory,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  }
}
function run(argv=process.argv.slice(2)) {
  const options=parseArgs(argv);
  const result={
    schema:'lhm.synthetic.performance.v1',
    generatedAt:new Date().toISOString(),
    environment:{platform:process.platform,arch:process.arch,node:process.version},
    fixture:'synthetic_native_direct_profile_metadata_without_accounts_or_sessions',
    iterations:options.iterations,
    results:options.sizes.map(n=>measureSynthetic(n,options.iterations)),
    claim:'Local synthetic measurements only; no real browser starts and no AdsPower comparison.'
  };
  const text=JSON.stringify(result,null,2)+'\n';
  if(options.output){
    fs.mkdirSync(path.dirname(options.output),{recursive:true});
    fs.writeFileSync(options.output,text,{encoding:'utf8',mode:0o600});
  }
  console.log(text);
  return result;
}
if(require.main===module){
  try{run();}
  catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={parseArgs,generateProfiles,measureSynthetic,run};
