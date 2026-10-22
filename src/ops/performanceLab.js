'use strict';
/**
 * LHM Performance Evidence Lab.
 * Deliberately tests LOCAL metadata operations, never launches a browser,
 * makes a network request or reads cookies/proxy secrets. Results contain
 * only aggregate timings/counters and are NOT AdsPower comparisons.
 */
const {performance} = require('node:perf_hooks');
const {buildDashboardSummary} = require('./dashboard');

const DEFAULT_ITERATIONS=15;
const MAX_PROFILES=10000;
function percentile(sorted,rate) {
  if(!sorted.length)throw Error('No benchmark samples');
  return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(rate*sorted.length)-1))];
}
function timedSamples(fn,iterations,clock=()=>performance.now()) {
  for(let i=0;i<3;i++)fn(); // warmup, not included
  const values=[];
  for(let i=0;i<iterations;i++){
    const start=clock();
    fn();
    const elapsed=clock()-start;
    if(!Number.isFinite(elapsed)||elapsed<0)throw Error('Invalid benchmark timer');
    values.push(elapsed);
  }
  values.sort((a,b)=>a-b);
  const rounded=x=>Math.round(x*1000)/1000;
  return {medianMs:rounded(percentile(values,.5)),
    p95Ms:rounded(percentile(values,.95)),
    minMs:rounded(values[0]),maxMs:rounded(values[values.length-1]),
    samples:values.length};
}
function runPerformanceLab(store,{iterations=DEFAULT_ITERATIONS,clock=()=>performance.now(),
  generatedAt=()=>new Date().toISOString()}={}) {
  if(!store||typeof store.getProfiles!=='function'||typeof store.getProfile!=='function')
    throw Error('Need a read-only LHM profile store');
  if(!Number.isInteger(iterations)||iterations<5||iterations>30)
    throw Error('Iterations must be 5–30');
  const initial=store.getProfiles();
  if(initial.length>MAX_PROFILES)throw Error('Benchmark supports up to 10,000 profiles');
  const ids=initial.slice(0,100).map(x=>x.id);
  // Any timing result carries NO names, URLs, groups, IDs, tokens or notes.
  const all=timedSamples(()=>{const profiles=store.getProfiles();
    if(profiles.length!==initial.length)throw Error('Profile count changed during benchmark');},
    iterations,clock);
  const batchLookup=timedSamples(()=> {
    for(const id of ids)if(!store.getProfile(id))throw Error('Profile changed during benchmark');
  },iterations,clock);
  const dashboard=timedSamples(()=>{
    const report=buildDashboardSummary({profiles:store.getProfiles()});
    if(report.profiles.total!==initial.length)throw Error('Inconsistent dashboard profile count');
  },iterations,clock);
  const memory=process.memoryUsage();
  return {
    schema:'lhm.performance.evidence.v1',
    generatedAt:generatedAt(),
    scope:'local_profile_metadata_only',
    status:'MEASURED_LOCAL_ONLY',
    profileCount:initial.length,
    lookupBatchSize:ids.length,
    iterations,
    environment:{
      platform:process.platform,arch:process.arch,node:process.version,
      // This is PROCESS rss, not per-browser memory consumption.
      processRssMiB:Math.round(memory.rss/1048576*10)/10
    },
    operations:{
      listAllProfiles:all,
      getProfileBatch:batchLookup,
      dashboardProjection:dashboard
    },
    limitations:[
      'Không mở browser, không đo thời gian mở tab/profile thật.',
      'Không đo CPU/RAM mỗi cửa sổ, network, proxy, DNS, WebRTC, TLS hoặc tracking.',
      'Không đo hiệu suất AdsPower và không xếp hạng sản phẩm.',
      'Số liệu thay đổi theo máy, tải nền, phiên Node/Electron và số lượng profile.',
      'Chỉ đo metadata cục bộ; không xác nhận chất lượng quảng cáo.'
    ]
  };
}
module.exports={runPerformanceLab,timedSamples,percentile,DEFAULT_ITERATIONS,MAX_PROFILES};
