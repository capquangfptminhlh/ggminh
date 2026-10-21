'use strict';
const assert=require('node:assert/strict');
const {automaticIpWarnings}=require('../src/health/autoIpWarnings');
const T=Date.parse('2026-10-21T00:00:00Z');
const obs=(profileId,ip,at,sessionId)=>({profileId,ip,observedAt:at,sessionId});

// Quiet baseline: two profiles, distinct IPs and subnets, no sessions.
let r=automaticIpWarnings([obs('a','10.0.0.5',T),obs('b','172.16.0.5',T+1000)]);
assert.equal(r.status,'normal');
assert.equal(r.warningCount,0);

// Shared exit IP across profiles -> high.
r=automaticIpWarnings([obs('a','203.0.113.7',T),obs('b','203.0.113.7',T+1000)]);
assert.ok(r.warnings.some(w=>w.code==='shared_exit_ip'&&w.level==='high'));

// Same /24, different hosts -> subnet concentration (GraphDefense-backed).
r=automaticIpWarnings([
 obs('a','198.51.100.10',T),obs('b','198.51.100.20',T+1000),
 obs('c','198.51.100.30',T+2000)]);
assert.ok(r.warnings.some(w=>w.code==='subnet_concentration'));

// IP changes mid-session -> high; same change across sessions is not this code.
r=automaticIpWarnings([
 obs('a','192.0.2.1',T,'s1'),obs('a','192.0.2.99',T+5000,'s1')]);
assert.ok(r.warnings.some(w=>w.code==='ip_changed_mid_session'));
r=automaticIpWarnings([
 obs('a','192.0.2.1',T,'s1'),obs('a','192.0.2.99',T+5000,'s2')]);
assert.ok(!r.warnings.some(w=>w.code==='ip_changed_mid_session'));

// Unstable egress: one profile on >=4 distinct IPs.
r=automaticIpWarnings([
 obs('a','10.1.0.1',T),obs('a','10.2.0.1',T+1),obs('a','10.3.0.1',T+2),
 obs('a','10.4.0.1',T+3)]);
assert.ok(r.warnings.some(w=>w.code==='egress_unstable'));

// Overlapping observations on a shared /24 -> temporal warning.
r=automaticIpWarnings([
 obs('a','203.0.113.10',T),obs('a','203.0.113.10',T+60000),
 obs('b','203.0.113.20',T+30000),obs('b','203.0.113.20',T+90000)]);
assert.ok(r.warnings.some(w=>w.code==='subnet_overlap'));

// Fail closed on malformed input.
assert.throws(()=>automaticIpWarnings([]),/non-empty/);
assert.throws(()=>automaticIpWarnings([obs('a','999.1.1.1',T)]),/IPv4/);
assert.throws(()=>automaticIpWarnings([obs('a','::1',T)]),/IPv4/);
assert.throws(()=>automaticIpWarnings([{profileId:'a',ip:'1.2.3.4'}]),/time/);
assert.throws(()=>automaticIpWarnings([obs('bad id!','1.2.3.4',T)]),/profile ID/);

console.log('auto-ip-warnings: PASS');
