'use strict';
const fs=require('node:fs');

const VERSION=/^\d{1,3}\.\d{1,5}\.\d{1,5}(?:\.\d{1,6})?$/;
const EVIDENCE=/^stage0-measure\/[A-Za-z0-9_.-]+\.json$/;
const PROXY_TYPES=Object.freeze(['http','socks5']);
const CLOSED_REASON='No approved capability policy for this signed Camoufox version';

function closed(reason=CLOSED_REASON){
 return {manual:false,proxyTypes:[],evidence:null,reason};
}
function validPolicy(policy){
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||
    Object.keys(policy).sort().join(',')!=='releases,schema'||
    policy.schema!==1||!Array.isArray(policy.releases)||
    policy.releases.length>100)return false;
 const versions=new Set();
 for(const release of policy.releases){
  if(!release||typeof release!=='object'||Array.isArray(release)||
     Object.keys(release).sort().join(',')!==
      'evidence,manual,proxyTypes,verdict,version'||
     !VERSION.test(release.version||'')||release.manual!==true||
     release.verdict!=='PASS'||!EVIDENCE.test(release.evidence||'')||
     !Array.isArray(release.proxyTypes)||release.proxyTypes.length>PROXY_TYPES.length||
     release.proxyTypes.some(type=>!PROXY_TYPES.includes(type))||
     new Set(release.proxyTypes).size!==release.proxyTypes.length||
     versions.has(release.version))return false;
  versions.add(release.version);
 }
 return true;
}
function evaluateCapabilities({engineVersion,policy}={}){
 if(!VERSION.test(engineVersion||''))return closed('Signed Camoufox version is missing or invalid');
 if(!validPolicy(policy))return closed('Camoufox capability policy is missing or invalid');
 const release=policy.releases.find(item=>item.version===engineVersion);
 if(!release)return closed();
 return {manual:true,proxyTypes:PROXY_TYPES.filter(type=>release.proxyTypes.includes(type)),
  evidence:release.evidence,reason:null};
}
function loadCapabilityPolicy(filename){
 try{
  if(typeof filename!=='string'||!filename)return null;
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>1024*1024)return null;
  const parsed=JSON.parse(fs.readFileSync(filename,'utf8'));
  return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
 }catch(_){return null}
}

module.exports={evaluateCapabilities,loadCapabilityPolicy,validPolicy,
 PROXY_TYPES,CLOSED_REASON};
