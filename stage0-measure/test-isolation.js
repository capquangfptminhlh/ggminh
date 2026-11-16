'use strict';
/**
 * Contract tests for the extended Section 17.2 isolation result builders
 * in core.js. Pure logic only: the real browser runs live in
 * run-isolation.js and stay NOT_RUN until executed on a real engine.
 */
const assert=require('node:assert/strict');
const {ISO_FIELDS,concurrentIsolationResult,crashRecoveryResult,
 restoreIsolationResult,httpCacheIsolationResult,faviconCacheResult}=require('./core');
const map=(value)=>Object.fromEntries(ISO_FIELDS.map(f=>[f,value]));

// --- concurrent writes: simultaneous + interleaved cross-writes ----------
const cm={a1:'a-round-1',a2:'a-round-2',b1:'b-round-1',b2:'b-round-2'};
const goodRounds={afterFirst:{a:map(cm.a1),b:map(cm.b1)},
 afterSecond:{a:map(cm.a2),b:map(cm.b2)}};
assert.equal(concurrentIsolationResult(goodRounds,cm).pass,true);
assert.equal(concurrentIsolationResult(
 {afterFirst:{a:map(cm.a1),b:map(cm.a1)},afterSecond:{a:map(cm.a2),b:map(cm.b2)}},
 cm).checks.localStorage.bOwnAfterSimultaneousWrite,false);
assert.equal(concurrentIsolationResult(
 {afterFirst:goodRounds.afterFirst,
  afterSecond:{a:{...map(cm.a2),cacheStorage:cm.b2},b:map(cm.b2)}},
 cm).pass,false);
assert.throws(()=>concurrentIsolationResult(
 {afterFirst:{a:map(cm.a1)},afterSecond:goodRounds.afterSecond},cm),/Missing observation/);
assert.throws(()=>concurrentIsolationResult(goodRounds,{...cm,b2:cm.a2}),/Distinct/);

// --- crash recovery -------------------------------------------------------
const km={a:'a-crash',b:'b-crash'};
const goodCrash={aBefore:map(km.a),aAfter:map(km.a),bBefore:map(km.b),bAfter:map(km.b)};
assert.equal(crashRecoveryResult(goodCrash,km).pass,true);
assert.equal(crashRecoveryResult(
 {...goodCrash,aAfter:{...map(km.a),indexedDB:null}},km)
 .checks.indexedDB.aMarkerIntactAfterCrash,false);
assert.equal(crashRecoveryResult(
 {...goodCrash,bAfter:{...map(km.b),cookie:km.a}},km).pass,false);
assert.equal(crashRecoveryResult(
 {...goodCrash,aBefore:{...map(km.a),cookie:null}},km)
 .checks.cookie.aHadMarkerBeforeCrash,false);
assert.throws(()=>crashRecoveryResult({...goodCrash,bAfter:null},km),/Missing observation/);

// --- snapshot restore -----------------------------------------------------
const rm={snapshot:'a-snap',postSnapshot:'a-later',other:'b-own'};
const goodRestore={restored:map(rm.snapshot),other:map(rm.other)};
assert.equal(restoreIsolationResult(goodRestore,rm).pass,true);
assert.equal(restoreIsolationResult(
 {restored:map(rm.postSnapshot),other:map(rm.other)},rm)
 .checks.cookie.restoredEqualsSnapshot,false);
assert.equal(restoreIsolationResult(
 {restored:{...map(rm.snapshot),localStorage:rm.other},other:map(rm.other)},rm)
 .checks.localStorage.restoredExcludesOtherProfile,false);
assert.equal(restoreIsolationResult(
 {restored:map(rm.snapshot),other:map(rm.snapshot)},rm)
 .checks.cookie.otherProfileUnaffected,false);

// --- HTTP cache partitioning ----------------------------------------------
const goodHttp={hitsAfterAFirst:1,hitsAfterASecond:1,hitsAfterBFirst:2,
 bodyAFirst:'asset-1',bodyASecond:'asset-1',bodyBFirst:'asset-2',
 aEtag:'"asset-1"',revalidationEtagSeen:'"asset-1"'};
assert.equal(httpCacheIsolationResult(goodHttp).pass,true);
assert.equal(httpCacheIsolationResult({...goodHttp,hitsAfterASecond:2})
 .checks.aSecondLoadServedFromOwnCache,false);
assert.equal(httpCacheIsolationResult({...goodHttp,hitsAfterBFirst:1,bodyBFirst:'asset-1'})
 .checks.bFetchedFreshFromServer,false);
assert.equal(httpCacheIsolationResult({...goodHttp,revalidationEtagSeen:'"asset-2"'})
 .checks.aRevalidationPresentsOwnEtag,false);
assert.throws(()=>httpCacheIsolationResult({...goodHttp,bodyBFirst:null}),/Missing cache/);

// --- favicon cache ----------------------------------------------------------
assert.deepEqual(faviconCacheResult({hitsAfterA:0,hitsAfterB:0}),
 {measurable:false,pass:false,checks:{aFetchedFavicon:false,bFetchedOwnFavicon:false}});
assert.equal(faviconCacheResult({hitsAfterA:1,hitsAfterB:2}).pass,true);
assert.equal(faviconCacheResult({hitsAfterA:1,hitsAfterB:1}).pass,false);
assert.throws(()=>faviconCacheResult({hitsAfterA:2,hitsAfterB:1}),/Missing favicon/);

console.log('Stage-0 isolation contract: PASS; real browser condition runs NOT_RUN until run-isolation.js executes');
