'use strict';
const assert=require('assert');
const {assessRuntime}=require('../src/engine/camoufoxRuntimeGate');
const noTrust=assessRuntime({platform:'win32'});
assert.strictEqual(noTrust.canInstall,false);
assert.strictEqual(noTrust.manualReady,false);
assert.match(noTrust.reason,/trust anchor/i);
const downloadable=assessRuntime({platform:'win32',publisherTrusted:true,
 releaseConfigured:true});
assert.strictEqual(downloadable.canInstall,true);
assert.strictEqual(downloadable.manualReady,false);
assert.match(downloadable.reason,/not installed/i);
const manual=assessRuntime({platform:'win32',publisherTrusted:true,
 releaseConfigured:true,verifiedBundle:true,version:'156.0.1',
 manualApproved:true,approvedProxyTypes:[],evidence:'stage0-measure/manual.json'});
assert.strictEqual(manual.ready,true);
assert.strictEqual(manual.manualReady,true);
assert.deepEqual(manual.approvedProxyTypes,[]);
assert.match(manual.reason,/proxy is not approved/i);
const proxied=assessRuntime({platform:'win32',publisherTrusted:true,
 releaseConfigured:true,verifiedBundle:true,version:'156.0.1',
 manualApproved:true,approvedProxyTypes:['http','socks5'],
 evidence:'stage0-measure/ip-leak-results-gecko-2026-11-07.json'});
assert.strictEqual(proxied.manualReady,true);
assert.deepEqual(proxied.approvedProxyTypes,['http','socks5']);
assert.match(proxied.reason,/HTTP\/SOCKS5 proxy approved/);
assert.strictEqual(proxied.automationAvailable,false);
const unsupported=assessRuntime({platform:'linux',publisherTrusted:true,
 releaseConfigured:true,verifiedBundle:true,manualApproved:true});
assert.strictEqual(unsupported.ready,false);
assert.strictEqual(unsupported.canInstall,false);
console.log('Camoufox runtime gate separates trust, install, manual and approved proxy capabilities');
