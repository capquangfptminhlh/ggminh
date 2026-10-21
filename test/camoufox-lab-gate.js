'use strict';
const assert=require('assert');
const path=require('path');
const {spawnSync}=require('child_process');
const script=path.join(__dirname,'..','tools','test-camoufox-proxy.mjs');
// Clear any inherited proxy lab configuration: a missing lab must NEVER
// produce a green pass or load the unavailable production Camoufox package.
const env={...process.env};
for(const name of ['LHM_CAMOUFOX_EXECUTABLE','LHM_PROXY_SERVER',
 'LHM_EXPECTED_EGRESS_IP','LHM_IP_ECHO_URL','LHM_STUN_SERVER',
 'LHM_PROXY_USERNAME','LHM_PROXY_PASSWORD'])delete env[name];
const run=spawnSync(process.execPath,[script],{
 cwd:path.join(__dirname,'..'),env,encoding:'utf8',timeout:15000
});
assert.strictEqual(run.status,2,run.stderr);
const out=JSON.parse(run.stdout.trim());
assert.strictEqual(out.status,'NOT_RUN');
assert.strictEqual(out.webrtc,'not-tested');
assert(!/PASS|ROUTE_VERIFIED/.test(run.stdout));
console.log('Unconfigured proxy, DNS and WebRTC lab fail closed with NOT_RUN exit 2');
