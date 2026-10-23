'use strict';
const assert=require('node:assert/strict');
const {behaviorPatternWarnings}=require('../src/monitor/behaviorPatterns');
const T=Date.parse('2026-10-21T00:00:00Z');
const ev=(action,profileId,at,source='manual')=>({action,profileId,source,at});

// Quiet baseline: spaced, dissimilar activity.
let r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_close','a',T+3600000),
 ev('profile_open','b',T+7200000)]);
assert.equal(r.level,'normal');
assert.equal(r.alertCount,0);

// Synchronized burst: 3 profiles opened within 60s.
r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_open','b',T+15000),
 ev('profile_open','c',T+45000)]);
let alert=r.alerts.find(a=>a.code==='synchronized_open_burst');
assert.ok(alert);
assert.deepEqual(alert.profiles,['a','b','c']);
assert.equal(alert.windowFrom,T);
assert.equal(alert.windowTo,T+45000);
assert.deepEqual(alert.values,{action:'profile_open',windowMs:60000});

// Two profiles inside 60s is below the burst threshold.
r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_open','b',T+30000)]);
assert.ok(!r.alerts.some(a=>a.code==='synchronized_open_burst'));

// Identical sequences: open -> save -> close by both profiles, close in time.
r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_save','a',T+60000),
 ev('profile_close','a',T+120000),
 ev('profile_open','b',T+180000),ev('profile_save','b',T+240000),
 ev('profile_close','b',T+300000)]);
alert=r.alerts.find(a=>a.code==='identical_sequence');
assert.ok(alert);
assert.deepEqual(alert.profiles,['a','b']);
assert.equal(alert.windowFrom,T);
assert.equal(alert.windowTo,T+300000);
assert.deepEqual(alert.values.sequence,
 ['profile_open','profile_save','profile_close']);

// Profile scope is canonical regardless of which profile appears first in
// the event stream, so warning IDs/history do not fork on input ordering.
r=behaviorPatternWarnings([
 ev('profile_open','zeta',T),ev('profile_save','zeta',T+60000),
 ev('profile_close','zeta',T+120000),
 ev('profile_open','alpha',T+180000),ev('profile_save','alpha',T+240000),
 ev('profile_close','alpha',T+300000)]);
alert=r.alerts.find(a=>a.code==='identical_sequence');
assert.deepEqual(alert.profiles,['alpha','zeta']);

// Different sequences do not trigger it.
r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_save','a',T+60000),
 ev('profile_close','a',T+120000),
 ev('profile_open','b',T+180000),ev('profile_close','b',T+240000),
 ev('profile_save','b',T+300000)]);
assert.ok(!r.alerts.some(a=>a.code==='identical_sequence'));

// Machine-like regularity: opens exactly every 5 minutes.
r=behaviorPatternWarnings([0,1,2,3,4].map(i=>
 ev('profile_open','a',T+i*300000,'api')));
alert=r.alerts.find(a=>a.code==='regular_interval_open');
assert.ok(alert);
assert.deepEqual(alert.profiles,['a']);
assert.equal(alert.windowFrom,T);
assert.equal(alert.windowTo,T+1200000);
assert.deepEqual(alert.values.intervalsMs,[300000,300000,300000,300000]);
assert.equal(alert.values.coefficientOfVariation,0);
assert.ok(!/nhịp đều như máy|machine-like/i.test(alert.message));

// Irregular opens do not trigger regularity.
r=behaviorPatternWarnings([
 ev('profile_open','a',T),ev('profile_open','a',T+100000),
 ev('profile_open','a',T+900000),ev('profile_open','a',T+950000)]);
assert.ok(!r.alerts.some(a=>a.code==='regular_interval_open'));

// Bulk open+close: 8 opens and 8 closes within 10 minutes (spread profiles
// and times so no other rule is what fires first — code presence is enough).
const bulk=[];
for(let i=0;i<8;i++){
 bulk.push(ev('profile_open','p'+i,T+i*30000));
 bulk.push(ev('profile_close','p'+i,T+i*30000+15000));
}
r=behaviorPatternWarnings(bulk);
alert=r.alerts.find(a=>a.code==='bulk_open_close');
assert.ok(alert);
assert.deepEqual(alert.profiles,['p0','p1','p2','p3','p4','p5','p6','p7']);
assert.equal(alert.windowFrom,T);
assert.equal(alert.windowTo,T+225000);
assert.deepEqual(alert.values,{opens:8,closes:8,windowMs:600000});

// Fail closed on malformed events.
assert.throws(()=>behaviorPatternWarnings([{action:'nope',profileId:'a',source:'manual',at:T}]),/Invalid/);
assert.throws(()=>behaviorPatternWarnings('nope'),/bounded array/);

console.log('behavior-patterns: PASS');
