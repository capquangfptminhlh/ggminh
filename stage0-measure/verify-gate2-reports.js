'use strict';
// Fail-closed aggregation. Every mandatory local measurement must have
// independently executed and reported PASS; skipped/timeout = NOT_RUN.
// This script does NOT attest to production engine signing or IP leakage.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','stage0-measure-results');
function read(file){try{const v=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));return v&&typeof v==='object'?v:null;}catch(_){return null}}
const baseline=read('stage0-local-report.json');
const configured=read('stage0-config-report.json');
const okBaseline=baseline?.classification==='LOCAL_STAGE0_DIAGNOSTIC_ONLY' && baseline?.checks?.status==='PASS' && baseline?.cleanup==='PASS';
const okConfigured=configured?.classification==='LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY' && configured?.identity?.status==='PASS' && configured?.checks?.status==='PASS' && configured?.cleanup==='PASS';
const sameBrowser=!!(baseline&&configured&&baseline.browserExecutableSha256===configured.browserExecutableSha256);
const sameCommit=!!(baseline&&configured&&baseline.branchHead&&configured.branchHead&&baseline.branchHead===configured.branchHead);
const accepted=!!(okBaseline&&okConfigured&&sameBrowser&&sameCommit);
const verdict={classification:'GATE2_SYNTHETIC_CONFIGURED_ONLY',accepted,
 baseline:baseline?.checks?.status||'NOT_RUN',configuredIdentity:configured?.identity?.status||'NOT_RUN',
 configuredStorage:configured?.checks?.status||'NOT_RUN',sameBrowser,sameCommit,
 network:'NOT_RUN',installedClient:'NOT_RUN',publisherSignedRelease:'NOT_RUN'};
console.log(JSON.stringify(verdict));
if(!accepted)process.exitCode=2;
