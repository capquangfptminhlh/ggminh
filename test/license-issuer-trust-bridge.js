'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PUBLIC_KEY}=require('../src/licensing/manager');
const {assertIssuerMatch,WINDOWS_ISSUER_SPKI_SHA256}=require('../tools/browser-production-smoke');
async function check(){
 const pubDer=crypto.createPublicKey(PUBLIC_KEY).export({format:'der',type:'spki'});
 const expected=pubDer.toString('base64');
 const worker=await import(pathToFileURL(path.resolve(__dirname,'../serverless/license-worker/src/index.mjs')).href);
 assert.equal(worker.CLIENT_ISSUER_SPKI_B64,expected,
  'Windows public key and pinned Worker issuer key cannot drift');
 assert.equal(WINDOWS_ISSUER_SPKI_SHA256,
  crypto.createHash('sha256').update(pubDer).digest('hex'));
 assert.equal(assertIssuerMatch({status:'ok',issuerKeySha256:WINDOWS_ISSUER_SPKI_SHA256}),true);
 for(const x of [
  {status:'ok'}, {status:'degraded',issuerKeySha256:WINDOWS_ISSUER_SPKI_SHA256},
  {status:'ok',issuerKeySha256:'0'.repeat(64)}
 ])assert.throws(()=>assertIssuerMatch(x),/issuer|readiness/);
 const source=fs.readFileSync(path.resolve(__dirname,'../serverless/license-worker/src/index.mjs'),'utf8');
 assert(source.includes("issuer_client_trust_mismatch"));
 assert(source.includes("const scopedIssuerKeys="));
 assert(source.includes('issuerKeys:scopedIssuerKeys'));
 const smoke=fs.readFileSync(path.resolve(__dirname,'../tools/browser-production-smoke.js'),'utf8');
 assert(smoke.includes('assertIssuerMatch(healthResult)'));
 console.log('Cloudflare desktop issuer trust: SHA-256, health, mismatch rejection PASS (synthetic only)');
}
check().catch(e=>{console.error(e);process.exitCode=1});
