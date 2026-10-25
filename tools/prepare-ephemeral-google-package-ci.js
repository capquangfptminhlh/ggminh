#!/usr/bin/env node
'use strict';
// CI-only packaging fixture. One-time Ed25519 test issuer; no secret file,
// no production credentials, and no deploy/release/artifact permission.
const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs');
const {prepareGoogleStagingPackage,ALLOW}=require('./prepare-google-staging-package');
if(process.argv[2]!=='--ci-test-only'||process.env.CI!=='true'||
   process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_OUTPUT)
  throw Error('Ephemeral Gmail installer fixture permitted only in CI test job');
const publicKey=crypto.generateKeyPairSync('ed25519').publicKey;
const der=publicKey.export({format:'der',type:'spki'});
const b64=der.toString('base64');
const fingerprint=crypto.createHash('sha256').update(der).digest('hex');
prepareGoogleStagingPackage({root:path.resolve(__dirname,'..'),
 publicKeyB64:b64,confirmation:ALLOW,expectedSha256:fingerprint});
fs.appendFileSync(process.env.GITHUB_OUTPUT,'public_fingerprint='+fingerprint+'\n');
console.log('PASS: isolated Gmail test build prepared with throwaway public-key pin only');
