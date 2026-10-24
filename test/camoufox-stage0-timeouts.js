'use strict';
const assert=require('node:assert/strict');
const {runStage,startHardDeadline}=require('../stage0-measure/steps');
async function main(){
 assert.equal(await runStage('small success',async()=>17,200),17);
 await assert.rejects(()=>runStage('small rejected',()=>Promise.reject(Error('expected failure')),200),/expected failure/);
 await assert.rejects(()=>runStage('small timeout',()=>new Promise(()=>{}),40),/timed out: small timeout/);
 assert.throws(()=>runStage('x',()=>true),/Invalid/);
 assert.throws(()=>runStage('invalid ms',()=>true,0),/Invalid/);
 const release=startHardDeadline(250);
 release();
 console.log('Stage-0 bounded operation diagnostics PASS (synthetic; real Camoufox NOT_RUN)');
}
main().catch(e=>{console.error(e);process.exitCode=1});
