'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {LicensePolicy,TRIAL_DAYS}=require('../src/licensing/enforcement');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-policy-'));
try{
 const start=Date.parse('2026-10-20T00:00:00.000Z');
 let now=start;
 let entitlement={installationId:'11111111-1111-4111-8111-111111111111',
  active:false,status:'inactive',features:[],maxProfiles:null};
 const manager={installationId:entitlement.installationId,status:()=>({...entitlement})};
 const make=()=>new LicensePolicy(root,manager,{clock:()=>now});
 const gate=make();
 const trial=gate.status();
 assert.strictEqual(trial.access,'trial');
 assert.strictEqual(trial.trialDaysLeft,TRIAL_DAYS);
 assert.strictEqual(trial.maxProfiles,10);
 assert.deepStrictEqual(trial.features,['profiles','automation','api']);
 gate.assertCapacity(9,1);
 assert.throws(()=>gate.assertCapacity(9,2),/Giới hạn/);
 assert.strictEqual(make().startedAt,start);
 now=start+29*86400000;
 assert.strictEqual(gate.status().trialDaysLeft,1);
 now=start+31*86400000;
 assert.strictEqual(gate.status().access,'blocked');
 assert.throws(()=>gate.require('automation'),/hết hạn/);
 assert.throws(()=>gate.assertCapacity(1),/hết hạn/);
 entitlement={...entitlement,active:true,status:'active',plan:'starter',
  features:['profiles'],maxProfiles:3};
 assert.strictEqual(gate.status().access,'licensed');
 gate.assertCapacity(2);
 assert.throws(()=>gate.assertCapacity(3),/Giới hạn/);
 assert.throws(()=>gate.require('automation'),/không cho phép/);
 assert.throws(()=>gate.require('api'),/không cho phép/);
 entitlement={...entitlement,features:['profiles','automation','api'],
  plan:'business',maxProfiles:200};
 gate.require('automation');gate.require('api');gate.assertCapacity(199);
 entitlement={...entitlement,active:false,status:'expired'};
 assert.strictEqual(gate.status().access,'blocked');
 now=start-3*86400000;
 assert.strictEqual(gate.status().reason,'clock_error');
 const record=JSON.parse(fs.readFileSync(gate.file,'utf8'));
 assert.strictEqual(record.installationId,manager.installationId);
 console.log('v5.1 entitlement gate: 30-day trial, signed license overrides, capacity, expired and feature rights passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
