'use strict';

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

function gate(id,status,reason,evidence=null){
 if(!GATE_IDS.includes(id)||!STATUS.has(status)||typeof reason!=='string'||!reason)
  throw Error('Invalid Camoufox preflight gate');
 return {id,status,reason,evidence};
}

function validateCandidate(candidate){
 const hash=/^[a-f0-9]{64}$/i;
 if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
  !/^[a-f0-9]{40}$/i.test(candidate.commit||'')||
  !hash.test(candidate.engineSha256||'')||
  !hash.test(candidate.installerSha256||'')||
  typeof candidate.engineVersion!=='string'||
  !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(candidate.engineVersion))
  throw Error('Invalid Camoufox preflight candidate');
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
 validateCandidate(candidate);
 if(!Array.isArray(gates))throw Error('Camoufox preflight gates must be an array');
 const seen=new Set();
 for(const item of gates){
  if(!item||typeof item!=='object')throw Error('Invalid Camoufox preflight gate');
  gate(item.id,item.status,item.reason,item.evidence);
  if(seen.has(item.id))throw Error('Invalid Camoufox preflight gate');
  seen.add(item.id);
 }
 const timestamp=now instanceof Date?now:new Date(now);
 if(Number.isNaN(timestamp.getTime()))throw Error('Invalid Camoufox preflight time');
 return finalize(candidate,gates,timestamp.toISOString());
}

module.exports={GATE_IDS,LIMITATION,gate,evaluateCamoufoxReleasePreflight};
