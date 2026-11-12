'use strict';

const {isIPv4,isIPv6}=require('node:net');
const {win32}=require('node:path');
const {types}=require('node:util');

const GATE_IDS=Object.freeze([
 'artifact-trust',
 'publisher-ceremony',
 'configured-identity',
 'storage-isolation',
 'crash-durability',
 'graphics-fingerprint',
 'real-proxy-network',
 'resource-capacity',
 'packaged-ui',
 'clean-install-upgrade'
]);
const LIMITATION='This result does not prove that a website cannot associate profiles.';
const STATUS=new Set(['PASS','BLOCKED','MANUAL_REQUIRED']);
const EVIDENCE_SCHEMA='lhm.camoufox-preflight.evidence.v1';
const INSTALLED_ENVIRONMENT='windows-installed-engine';
const MAX_AGE_MS=30*24*60*60*1000;
const MAX_FUTURE_MS=5*60*1000;
const CANDIDATE_FIELDS=['commit','engineVersion','engineSha256','installerSha256'];
const FORBIDDEN_KEY=/proxy|password|secret|token|cookie|account|profileName|privateKey|identityBlob|ipAddress/i;
const SAFE_PRIVATE_KEY_FIELD='privateKeyEncryptedOutsideGit';
const SAFE_NETWORK_FIELDS=new Set(['realProxyP2','labProxyP1','followedRealProxyRoute']);
const FORBIDDEN_TEXT=/https?:\/\/|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|CAMOU_CONFIG_/i;
const RESOURCE_RAM_TIERS=Object.freeze([8,16,32]);
const RESOURCE_WORKLOADS=Object.freeze(['light','medium','heavy']);
const RESOURCE_CONCURRENCY=Object.freeze([1,3,5,10]);
const REQUIRED_RESOURCE_MATRIX=Object.freeze(RESOURCE_RAM_TIERS.flatMap(ramGiB=>
 RESOURCE_WORKLOADS.flatMap(workload=>RESOURCE_CONCURRENCY.map(concurrency=>
  Object.freeze({ramGiB,workload,concurrency})
 ))));

function containsIpAddress(value){
 const ipv4=value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)||[];
 if(ipv4.some(isIPv4))return true;
 const ipv6=[];
 const expression=/(?:^|[^a-f0-9])((?:[a-f0-9]{0,4}:){2,}[a-f0-9:.]{0,})(?![a-f0-9])/gi;
 for(const match of value.matchAll(expression))ipv6.push(match[1]);
 return ipv6.some(part=>{
  const variants=[part,part.replace(/^\./,''),part.replace(/^:/,''),part.replace(/\.$/,''),
   part.replace(/:$/,''),part.replace(/^:/,'').replace(/\.$/,'')];
  return variants.some(isIPv6);
 });
}

function assertPrivacySafe(value,ancestors=new Set()){
 if(typeof value==='string'){
  if(FORBIDDEN_TEXT.test(value)||containsIpAddress(value))
   throw Error('Camoufox preflight data contains private information');
  return;
 }
 if(value==null||typeof value==='boolean'||typeof value==='number')return;
 if(typeof value!=='object'||types.isProxy(value)||ancestors.has(value))
  throw Error('Invalid Camoufox preflight data');
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==null&&prototype!==(Array.isArray(value)?Array.prototype:Object.prototype))
  throw Error('Invalid Camoufox preflight data');
 ancestors.add(value);
 for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string')throw Error('Invalid Camoufox preflight data');
  const property=Object.getOwnPropertyDescriptor(value,key);
  if(key!==SAFE_PRIVATE_KEY_FIELD&&!SAFE_NETWORK_FIELDS.has(key)&&FORBIDDEN_KEY.test(key))
   throw Error('Camoufox preflight data contains private information');
  if(!Object.hasOwn(property,'value'))throw Error('Invalid Camoufox preflight data');
  assertPrivacySafe(key,ancestors);
  assertPrivacySafe(property.value,ancestors);
 }
 ancestors.delete(value);
}

function copyPlainData(value){
 if(value===null||typeof value!=='object')return value;
 const copy=Array.isArray(value)?new Array(value.length):Object.create(Object.getPrototypeOf(value));
 for(const key of Reflect.ownKeys(value)){
  if(Array.isArray(value)&&key==='length')continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  Object.defineProperty(copy,key,{...descriptor,value:copyPlainData(descriptor.value)});
 }
 return copy;
}

function projectCandidate(candidate){
 return {
  commit:candidate.commit,
  engineVersion:candidate.engineVersion,
  engineSha256:candidate.engineSha256,
  installerSha256:candidate.installerSha256
 };
}

function gate(id,status,reason,evidence=null){
 if(!GATE_IDS.includes(id)||!STATUS.has(status)||typeof reason!=='string'||!reason)
  throw Error('Invalid Camoufox preflight gate');
 return {id,status,reason,evidence};
}

function validateCandidate(candidate){
 const hash=/^[a-f0-9]{64}$/i;
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
  typeof candidate.commit!=='string'||!/^[a-f0-9]{40}$/i.test(candidate.commit)||
  typeof candidate.engineSha256!=='string'||!hash.test(candidate.engineSha256)||
  typeof candidate.installerSha256!=='string'||!hash.test(candidate.installerSha256)||
  typeof candidate.engineVersion!=='string'||
  !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(candidate.engineVersion))
  throw Error('Invalid Camoufox preflight candidate');
}

function preflightTime(now){
 const timestamp=now instanceof Date?now:new Date(now);
 if(Number.isNaN(timestamp.getTime()))throw Error('Invalid Camoufox preflight time');
 return timestamp;
}

function normalizeEvidenceTimestamp(value){
 const isoTimestamp=/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
 const match=typeof value==='string'&&value.match(isoTimestamp);
 const timestamp=match&&Date.parse(value);
 // Date.parse can roll an impossible calendar day into the next month.
 if(!Number.isFinite(timestamp)||new Date(match[1]+'T00:00:00.000Z').toISOString().slice(0,10)!==match[1])
  throw Error('Evidence timestamp is invalid');
 return new Date(timestamp);
}

function validateEvidence(envelope,{candidate,kind,now=new Date(),requireInstalled=false}){
 assertPrivacySafe(envelope);
 assertPrivacySafe(candidate);
 validateCandidate(candidate);
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
  typeof envelope.schema!=='string'||typeof envelope.kind!=='string'||
  typeof envelope.environment!=='string'||!envelope.environment||
  !envelope.result||typeof envelope.result!=='object'||Array.isArray(envelope.result)||
  typeof kind!=='string'||!kind)
  throw Error('Invalid Camoufox preflight evidence');
 validateCandidate(envelope.candidate);
 const generatedAt=normalizeEvidenceTimestamp(envelope.generatedAt);
 const age=preflightTime(now).getTime()-generatedAt.getTime();
 let reason;
 if(envelope.schema!==EVIDENCE_SCHEMA)reason='Evidence schema is unsupported';
 else if(envelope.kind!==kind)reason='Evidence kind does not match the gate';
 else if(CANDIDATE_FIELDS.some(field=>envelope.candidate[field]!==candidate[field]))
  reason='Evidence candidate does not match the release candidate';
 else if(requireInstalled&&envelope.environment!==INSTALLED_ENVIRONMENT)
  reason='Evidence must come from the Windows installed engine';
 else if(age>MAX_AGE_MS)reason='Evidence is older than 30 days';
 else if(age< -MAX_FUTURE_MS)reason='Evidence is more than five minutes in the future';
 if(reason)return {status:'BLOCKED',reason};
 return {status:'PASS',generatedAt:generatedAt.toISOString(),result:copyPlainData(envelope.result)};
}

function evidenceBasename(value){
 if(typeof value!=='string'||!value||/[\\/]\.{1,2}(?:[\\/]|$)/.test(value)||
  value.startsWith('\\\\?\\')||value.startsWith('\\\\.\\')||/[\\/]$/.test(value))
  throw Error('Invalid Camoufox preflight evidence reference');
 const name=typeof value==='string'&&win32.basename(value);
 if(!name||!/^[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?$/i.test(name)||
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name))
  throw Error('Invalid Camoufox preflight evidence reference');
 return name;
}

function sanitizeEvidence(evidence){
 if(typeof evidence==='string')return evidenceBasename(evidence);
 if(evidence&&Object.hasOwn(evidence,'file'))
  return {...evidence,file:evidenceBasename(evidence.file)};
 return evidence;
}

function exactKeys(value,keys){
 return value&&typeof value==='object'&&!Array.isArray(value)&&
  Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}

function hasFields(value,keys){
 return value&&typeof value==='object'&&!Array.isArray(value)&&keys.every(key=>Object.hasOwn(value,key));
}

function gateEvidenceName(evidenceName){
 return evidenceName==null?null:evidenceBasename(evidenceName);
}

function evaluateEvidenceGate(envelope,{candidate,now=new Date(),evidenceName}={},id,kind,check,passReason){
 const checked=validateEvidence(envelope,{candidate,kind,now,requireInstalled:true});
 const evidence=gateEvidenceName(evidenceName);
 if(checked.status==='BLOCKED')return gate(id,'BLOCKED',checked.reason,evidence);
 if(!check(checked.result))return gate(id,'BLOCKED',`${id} evidence did not satisfy the required checks`,evidence);
 return gate(id,'PASS',typeof passReason==='function'?passReason(checked.result):passReason,evidence);
}

function evaluateConfiguredIdentity(envelope,options={}){
 return evaluateEvidenceGate(envelope,options,'configured-identity','identity',result=>{
  if(!hasFields(result,['profiles'])||!Array.isArray(result.profiles)||result.profiles.length!==2)return false;
  const ids=new Set();
  for(const profile of result.profiles){
   if(!profile||typeof profile!=='object'||Array.isArray(profile)||
    !hasFields(profile,['syntheticId','launchMatches','restartMatches','extended'])||
    typeof profile.syntheticId!=='string'||!profile.syntheticId.trim()||ids.has(profile.syntheticId)||
    profile.launchMatches!==true||profile.restartMatches!==true||
    !profile.extended||typeof profile.extended!=='object'||Array.isArray(profile.extended))return false;
   ids.add(profile.syntheticId);
   const points=Reflect.ownKeys(profile.extended);
   if(!points.length||points.some(point=>!['MEASURED','UNSUPPORTED','BLOCKED'].includes(profile.extended[point])||
    profile.extended[point]==='BLOCKED'))return false;
  }
  return true;
 },'Two distinct synthetic identities matched launch and restart checks');
}

const ISOLATION_CONDITIONS=Object.freeze([
 'baseline','concurrentCrossWrite','snapshotRestore','configBackupRestore','httpCache','faviconCache'
]);

function evaluateStorageIsolation(envelope,options={}){
 return evaluateEvidenceGate(envelope,options,'storage-isolation','isolation',result=>
  hasFields(result,ISOLATION_CONDITIONS)&&ISOLATION_CONDITIONS.every(condition=>result[condition]==='PASS'),
 'All six required storage isolation conditions passed');
}

function evaluateCrashDurability(envelope,options={}){
 return evaluateEvidenceGate(envelope,options,'crash-durability','crash',result=>{
  if(!hasFields(result,['idleFlush','shortCrash'])||
   !hasFields(result.idleFlush,['status','idleMs'])||result.idleFlush.status!=='PASS'||result.idleFlush.idleMs!==10000||
   !result.shortCrash||typeof result.shortCrash!=='object'||Array.isArray(result.shortCrash))return false;
  if(hasFields(result.shortCrash,['status','idleMs'])&&
   result.shortCrash.status==='PASS'&&result.shortCrash.idleMs===1500)return true;
  return exactKeys(result.shortCrash,[
   'status','idleMs','revertedFields','aLocalStorageEqualsPriorCommitted',
   'allOtherAFieldsPersisted','allBFieldsUnchanged','crossedProfileMarkers'
  ])&&result.shortCrash.status==='KNOWN_FINDING'&&result.shortCrash.idleMs===1500&&
   Array.isArray(result.shortCrash.revertedFields)&&result.shortCrash.revertedFields.length===1&&
   result.shortCrash.revertedFields[0]==='localStorage'&&
   result.shortCrash.aLocalStorageEqualsPriorCommitted===true&&
   result.shortCrash.allOtherAFieldsPersisted===true&&result.shortCrash.allBFieldsUnchanged===true&&
   result.shortCrash.crossedProfileMarkers===0;
 },result=>result.shortCrash.status==='KNOWN_FINDING'?
  'The 10-second idle-flush recovery passed; the bounded 1.5-second localStorage finding was observed':
  'The 10-second idle-flush recovery and 1.5-second crash recovery passed');
}

/* Graphics result schema: {headful,realGpu,profiles:[{vendorCompared,rendererCompared,
 * vendorMatches,rendererMatches,canvas,offlineAudio,font:{status,claim}}]}. Font is probe-only;
 * these checks do not establish a complete font inventory.
 */
function evaluateGraphicsFingerprint(envelope,options={}){
 return evaluateEvidenceGate(envelope,options,'graphics-fingerprint','graphics',result=>{
  if(!hasFields(result,['headful','realGpu','profiles'])||result.headful!==true||result.realGpu!==true||
   !Array.isArray(result.profiles)||result.profiles.length!==2)return false;
  return result.profiles.every(profile=>profile&&typeof profile==='object'&&!Array.isArray(profile)&&
   hasFields(profile,['vendorCompared','rendererCompared','vendorMatches','rendererMatches','canvas','offlineAudio','font'])&&
   profile.vendorCompared===2&&profile.rendererCompared===2&&
   profile.vendorMatches===true&&profile.rendererMatches===true&&
   profile.canvas==='MEASURED'&&profile.offlineAudio==='MEASURED'&&
   hasFields(profile.font,['status','claim'])&&profile.font.status==='MEASURED'&&
   profile.font.claim==='probe-only');
 },'Headful real-GPU checks matched both profiles; canvas and audio were measured and font was probe-only');
}

const NETWORK_REQUIREMENTS=Object.freeze([
 ['transportControl',value=>hasFields(value,['status','udpWorks'])&&value.status==='PASS'&&value.udpWorks===true,
  'Measure transport control and verify UDP works'],
 ['directPublicStun',value=>hasFields(value,['status','candidatesClassified'])&&value.status==='PASS'&&value.candidatesClassified===true,
  'Classify direct public STUN candidates'],
 ['realProxyP2',value=>hasFields(value,['status','unexpectedPublicCandidateCount'])&&value.status==='PASS'&&
  Number.isSafeInteger(value.unexpectedPublicCandidateCount)&&value.unexpectedPublicCandidateCount===0,
  'Measure P2 real-proxy public candidate count'],
 ['dns',value=>hasFields(value,['status','followedRealProxyRoute'])&&value.status==='PASS'&&value.followedRealProxyRoute===true,
  'Measure DNS routing through the real proxy'],
 ['runtimeVsManager',value=>hasFields(value,['status','bothObserved','agree'])&&value.status==='PASS'&&
  value.bothObserved===true&&value.agree===true,
  'Observe runtime and manager routing and compare them'],
 ['labProxyP1',value=>hasFields(value,['status','supportingOnly'])&&value.status==='PASS'&&value.supportingOnly===true,
  'Measure supporting P1 lab-proxy evidence']
]);

function evaluateRealProxyNetwork(envelope,options={}){
 const checked=validateEvidence(envelope,{candidate:options.candidate,kind:'network',now:options.now||new Date(),requireInstalled:true});
 const evidence=gateEvidenceName(options.evidenceName);
 if(checked.status==='BLOCKED')return gate('real-proxy-network','BLOCKED',checked.reason,evidence);
 for(const [field,check,reason] of NETWORK_REQUIREMENTS){
  if(!check(checked.result[field]))return gate('real-proxy-network','BLOCKED',reason,evidence);
 }
 return gate('real-proxy-network','PASS','Real-proxy transport, P2, DNS and runtime routing checks passed',evidence);
}

function resourceMatrixLabel(row){return `${row.ramGiB}GiB-${row.workload}-c${row.concurrency}`;}

function resourceReportRow(report,candidate,now){
 if(!report||typeof report!=='object'||Array.isArray(report)||
  report.schema!=='lhm.browser-resource.evidence.v1')return {reason:'schema or report shape'};
 let generatedAt;
 try{generatedAt=normalizeEvidenceTimestamp(report.generatedAt);}catch{return {reason:'generated timestamp'};}
 const age=preflightTime(now).getTime()-generatedAt.getTime();
 if(age>MAX_AGE_MS)return {reason:'stale report'};
 if(age< -MAX_FUTURE_MS)return {reason:'future report'};
 if(report.commit!==candidate.commit||!report.app||report.app.sha256!==candidate.installerSha256||
  !report.engine||report.engine.id!=='camoufox'||report.engine.version!==candidate.engineVersion||
  report.engine.sha256!==candidate.engineSha256)return {reason:'candidate binding'};
 if(!report.system||!Number.isFinite(report.system.totalRamBytes))return {reason:'RAM tier'};
 const ramGiB=RESOURCE_RAM_TIERS.find(tier=>report.system.totalRamBytes>=tier*1024**3*0.95&&
  report.system.totalRamBytes<=tier*1024**3*1.05);
 if(!ramGiB)return {reason:'RAM tier'};
 const workload=report.workload&&report.workload.id;
 const concurrency=report.workload&&report.workload.concurrency;
 if(!RESOURCE_WORKLOADS.includes(workload)||!RESOURCE_CONCURRENCY.includes(concurrency))return {reason:'workload matrix row'};
 const row={ramGiB,workload,concurrency};
 if(!Number.isSafeInteger(report.sampleCount)||report.sampleCount<10||!Array.isArray(report.samples)||
  report.samples.length<10||report.samples.length!==report.sampleCount)return {reason:'sample count'};
 if(report.crashCount!==0)return {reason:'crash count'};
 if(!report.cleanup||report.cleanup.status!=='PASS'||report.cleanup.remainingPids!==0)return {reason:'cleanup'};
 if(!report.headroomPolicy||report.headroomPolicy.minimumAvailableRatio!==0.20)return {reason:'headroom policy'};
 return {row};
}

function evaluateResourceCapacity(entries,options={}){
 const candidate=options.candidate,now=options.now||new Date();
 assertPrivacySafe(entries);assertPrivacySafe(candidate);validateCandidate(candidate);
 if(!Array.isArray(entries))throw Error('Resource capacity reports must be an array');
 const reportNames=[];const found=new Map();let invalidReason;
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)){
   invalidReason='Resource report entry did not validate';continue;
  }
  const suppliedName=entry.evidenceName??entry.file??entry.name;
  const name=evidenceBasename(suppliedName);reportNames.push(name);
  const report=Object.hasOwn(entry,'report')?entry.report:entry;
  const checked=resourceReportRow(report,candidate,now);
  if(!checked.row){invalidReason=`Resource report did not validate: ${name}`;continue;}
  const key=resourceMatrixLabel(checked.row);
  if(found.has(key)){invalidReason=`Duplicate resource report: ${key}`;continue;}
  found.set(key,name);
 }
 const evidence=[...new Set(reportNames)].sort((a,b)=>a<b?-1:a>b?1:0);
 if(invalidReason)return gate('resource-capacity','BLOCKED',invalidReason,evidence);
 for(const row of REQUIRED_RESOURCE_MATRIX){
  const key=resourceMatrixLabel(row);
  if(!found.has(key))return gate('resource-capacity','BLOCKED',`Missing resource report: ${key}`,evidence);
 }
 return gate('resource-capacity','PASS','All 36 required resource-capacity reports passed',evidence);
}

function safeCaptureName(value){
 if(typeof value!=='string'||! /^[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\.png$/i.test(value)||/[\\/]/.test(value))return false;
 return !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value.split('.')[0]);
}

function evaluatePackagedUi(envelope,options={}){
 const checked=validateEvidence(envelope,{candidate:options.candidate,kind:'packaged-ui',now:options.now||new Date(),requireInstalled:false});
 const evidence=gateEvidenceName(options.evidenceName);
 if(checked.status==='BLOCKED')return gate('packaged-ui','BLOCKED',checked.reason,evidence);
 if(envelope.environment!=='windows-packaged-app')
  return gate('packaged-ui','BLOCKED','Packaged UI evidence must come from the Windows packaged app',evidence);
 const result=checked.result;
 const captures=result.captures;
 if(result.exitCode!==0)return gate('packaged-ui','BLOCKED','Measure packaged UI process exit code',evidence);
 if(result.stderr!=='')return gate('packaged-ui','BLOCKED','Measure packaged UI stderr and require it to be empty',evidence);
 if(result.requiredCaptureCount!==13||!Array.isArray(captures)||captures.length!==13)
  return gate('packaged-ui','BLOCKED','Capture all 13 required packaged UI screenshots',evidence);
 const names=new Set();
 for(const capture of captures){
  if(!capture||typeof capture!=='object'||Array.isArray(capture)||!safeCaptureName(capture.name)||
   names.has(capture.name.toLowerCase())||!Number.isSafeInteger(capture.bytes)||capture.bytes<100000)
   return gate('packaged-ui','BLOCKED','Capture 13 distinct safe packaged UI PNGs of at least 100000 bytes',evidence);
  names.add(capture.name.toLowerCase());
 }
 return gate('packaged-ui','PASS','Packaged UI exited cleanly and all 13 required screenshots were captured',evidence);
}

function finalize(candidate,gates,generatedAt){
 const ordered=GATE_IDS.map(id=>gates.find(item=>item&&item.id===id));
 if(ordered.some(item=>!item))throw Error('Camoufox preflight omitted a required gate');
 const blockers=ordered.filter(item=>item.status!=='PASS')
  .map(item=>({gate:item.id,status:item.status,reason:item.reason}));
 return {
  schema:'lhm.camoufox-release-preflight.v1',generatedAt,candidate,
  overall:blockers.length?'BLOCKED':'READY_FOR_OWNER_REVIEW',
  gates:ordered,blockers,
  manualAssertions:ordered.filter(item=>item.id==='publisher-ceremony'||
   item.id==='clean-install-upgrade').map(item=>({gate:item.id,status:item.status})),
  limitation:LIMITATION
 };
}

function evaluateCamoufoxReleasePreflight(candidate,gates,now=new Date()){
 assertPrivacySafe(candidate);
 validateCandidate(candidate);
 if(!Array.isArray(gates))throw Error('Camoufox preflight gates must be an array');
 const seen=new Set();
 const sanitizedGates=[];
 for(const item of gates){
  if(!item||typeof item!=='object')throw Error('Invalid Camoufox preflight gate');
  assertPrivacySafe(item);
  const validated=gate(item.id,item.status,item.reason,item.evidence);
  if(seen.has(item.id))throw Error('Invalid Camoufox preflight gate');
  seen.add(item.id);
  validated.evidence=sanitizeEvidence(copyPlainData(validated.evidence));
  sanitizedGates.push(validated);
 }
 return finalize(projectCandidate(candidate),sanitizedGates,preflightTime(now).toISOString());
}

module.exports={GATE_IDS,LIMITATION,gate,assertPrivacySafe,validateEvidence,evaluateCamoufoxReleasePreflight,
 evaluateConfiguredIdentity,evaluateStorageIsolation,evaluateCrashDurability,evaluateGraphicsFingerprint,
 evaluateRealProxyNetwork,evaluateResourceCapacity,evaluatePackagedUi,REQUIRED_RESOURCE_MATRIX};
