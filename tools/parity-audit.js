'use strict';
const fs=require('fs'),path=require('path');
const file=path.join(__dirname,'../docs/feature-parity.json');
function report(values){
 if(!Array.isArray(values)||!values.length)throw Error('Missing feature-parity checklist');
 const ids=new Set(),counts={verified:0,partial:0,missing:0};
 for(const entry of values){
  if(!entry||typeof entry.id!=='string'||ids.has(entry.id)||
     !['verified','partial','missing'].includes(entry.state)||
     !entry.gaps||!entry.acceptance||typeof entry.evidence!=='string')
   throw Error('Incomplete or duplicated feature-parity item');
  ids.add(entry.id);counts[entry.state]++;
 }
 return {total:values.length,counts,
  complete:counts.verified===values.length,
  blockers:values.filter(x=>x.state!=='verified').map(x=>({id:x.id,state:x.state}))};
}
function main(args=process.argv.slice(2)){
 if(args.some(x=>!['--gate','--report'].includes(x)))throw Error('Use --report or --gate');
 const out=report(JSON.parse(fs.readFileSync(file,'utf8')));
 console.log('LHM Ads Browser parity:',JSON.stringify(out,null,2));
 if(args.includes('--gate')&&!out.complete)process.exitCode=2;
 return out;
}
if(require.main===module)main();
module.exports={report,main};
