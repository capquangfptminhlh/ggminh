'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path');
const {report}=require('../tools/parity-audit');
const matrix=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/feature-parity.json'),'utf8'));
const status=report(matrix);
assert(status.total>=15);
assert(!status.complete,'Do not declare full AdsPower parity before all groups are verified');
for(const key of ['fingerprint','synchronizer','teams','cloud-sync','ai-agent','extensions','cloud-phone'])
 assert(status.blockers.some(x=>x.id===key),'Must disclose missing parity group: '+key);
assert.throws(()=>report([...matrix,matrix[0]]),/duplicated/);
console.log('Feature-parity matrix and honest release blockers passed');
