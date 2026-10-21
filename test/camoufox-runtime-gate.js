'use strict';
const assert=require('assert');
const {compatibleNode,assessRuntime}=require('../src/engine/camoufoxRuntimeGate');
const checks=[
 ['20.18.0',false],['22.0.0',false],['22.14.9',false],
 ['22.15.0',true],['22.15.1',true],['23.0.0',true],['24.0.0',true]
];
for(const [version,expected] of checks)
 assert.strictEqual(compatibleNode(version),expected,version);
for(const value of ['',null,'twentytwo','22.15.0-rc.1'])
 assert.throws(()=>compatibleNode(value),/Invalid Node/);
assert.strictEqual(assessRuntime({nodeVersion:'20.18.0',launcherPresent:true}).ready,false);
assert.strictEqual(assessRuntime({nodeVersion:'22.15.0',launcherPresent:false}).ready,false);
assert.strictEqual(assessRuntime({nodeVersion:'22.15.0',launcherPresent:true}).ready,true);
console.log('Camoufox runtime gate denies Electron Node 20 or missing official TypeScript launcher');
