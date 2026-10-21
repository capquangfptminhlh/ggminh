'use strict';
/**
 * Per-profile pinned Camoufox identity.
 *
 * An identity is the CAMOU_CONFIG blob produced by the official `camoufox`
 * launcher library (fpgen draws one internally-consistent identity from the
 * real-world distribution; the blob is what the patched engine reads from
 * its process environment at launch). This module NEVER hand-builds or
 * edits fingerprint values: it only validates, stores and replays a blob
 * that the official generator produced, and derives the expectations a
 * measurement must observe. Generation lives in
 * tools/generate-camoufox-identity.mjs and runs at provisioning time, so
 * the app runtime needs no generator dependency.
 *
 * Fail-closed rules:
 * - chunks must be CAMOU_CONFIG_1..N, sequential, strings, each within the
 *   Windows environment-variable length limit the generator chunks by;
 * - the joined blob must parse to a plain JSON object;
 * - stored expectations must match the blob exactly (a hand-edited blob
 *   cannot smuggle different expectations past measurement);
 * - expectations must not contradict the profile's own declared fields.
 */
const {uaFamily,platformFamily}=require('../health/signalChain');

const IDENTITY_FORMAT='camoufox-camou-config';
const IDENTITY_VERSION=1;
const MAX_CHUNKS=512;
// The official generator chunks at 2047 chars on Windows hosts and 32767
// elsewhere; both are legitimate blobs. Replay re-chunks to the Windows
// size so an identity generated on any host launches safely on Windows.
const MAX_CHUNK_LENGTH=32767;
const REPLAY_CHUNK_LENGTH=2047;
const MAX_BLOB_LENGTH=262144;
const EXPECTATION_KEYS=['userAgent','platform','language','timezone',
 'screenWidth','screenHeight','hardwareConcurrency','webglVendor','webglRenderer'];

function isRecord(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}

function parseCamouConfigEnv(env){
 if(!isRecord(env))throw Error('Camoufox identity env must be an object');
 const keys=Object.keys(env);
 for(const key of keys)
  if(!/^CAMOU_CONFIG_\d+$/.test(key))
   throw Error('Unexpected key in Camoufox identity env: '+key);
 if(!keys.length)throw Error('Camoufox identity env has no CAMOU_CONFIG chunks');
 if(keys.length>MAX_CHUNKS)throw Error('Camoufox identity env has too many chunks');
 const ordered=keys.map(k=>({n:Number(k.slice('CAMOU_CONFIG_'.length)),k}))
  .sort((a,b)=>a.n-b.n);
 ordered.forEach((entry,index)=>{
  if(entry.n!==index+1)
   throw Error('Camoufox identity env chunks must be sequential from CAMOU_CONFIG_1');
  const value=env[entry.k];
  if(typeof value!=='string'||!value.length)
   throw Error('Camoufox identity chunk '+entry.k+' must be a non-empty string');
  if(value.length>MAX_CHUNK_LENGTH)
   throw Error('Camoufox identity chunk '+entry.k+' exceeds the environment length limit');
 });
 const blob=ordered.map(e=>env[e.k]).join('');
 if(blob.length>MAX_BLOB_LENGTH)throw Error('Camoufox identity blob is too large');
 let config;
 try{config=JSON.parse(blob);}
 catch(_){throw Error('Camoufox identity blob is not valid JSON');}
 if(!isRecord(config))throw Error('Camoufox identity blob must be a JSON object');
 return config;
}

function summarizeIdentity(config){
 if(!isRecord(config))throw Error('Camoufox identity config must be an object');
 const pick=(key)=>config[key]===undefined?null:config[key];
 // The blob stores locale parts (locale:language/region/script), not the
 // composed tag: the engine exposes navigator.language as language-REGION
 // (verified against a real generated identity + live launch).
 let language=pick('navigator.language');
 if(language===null){
  const lang=pick('locale:language'),region=pick('locale:region');
  if(typeof lang==='string'&&lang)
   language=typeof region==='string'&&region?lang+'-'+region:lang;
 }
 return {
  userAgent:pick('navigator.userAgent'),
  platform:pick('navigator.platform'),
  language,
  timezone:pick('timezone'),
  screenWidth:pick('screen.width'),
  screenHeight:pick('screen.height'),
  hardwareConcurrency:pick('navigator.hardwareConcurrency'),
  webglVendor:pick('webGl:vendor'),
  webglRenderer:pick('webGl:renderer')
 };
}

function validateStoredIdentity(identity){
 if(!isRecord(identity))throw Error('Camoufox identity must be an object');
 if(identity.format!==IDENTITY_FORMAT)
  throw Error('Unsupported Camoufox identity format');
 if(identity.version!==IDENTITY_VERSION)
  throw Error('Unsupported Camoufox identity version');
 if(typeof identity.generator!=='string'||!/^camoufox@\d+\.\d+\.\d+$/.test(identity.generator))
  throw Error('Camoufox identity must record its official generator version');
 const config=parseCamouConfigEnv(identity.env);
 const derived=summarizeIdentity(config);
 if(!isRecord(identity.expectations))
  throw Error('Camoufox identity must carry measurement expectations');
 for(const key of EXPECTATION_KEYS){
  const stored=identity.expectations[key]===undefined?null:identity.expectations[key];
  if(stored!==derived[key])
   throw Error('Camoufox identity expectations do not match its config blob ('+key+')');
 }
 if(typeof derived.userAgent!=='string'||!derived.userAgent)
  throw Error('Camoufox identity blob has no user agent');
 if(typeof derived.platform!=='string'||!derived.platform)
  throw Error('Camoufox identity blob has no platform');
 return {config,expectations:derived};
}

function rechunkCamouConfigEnv(env,size=REPLAY_CHUNK_LENGTH){
 if(!Number.isInteger(size)||size<256||size>MAX_CHUNK_LENGTH)
  throw Error('Invalid Camoufox chunk size');
 parseCamouConfigEnv(env);
 const keys=Object.keys(env).map(k=>({n:Number(k.slice('CAMOU_CONFIG_'.length)),k}))
  .sort((a,b)=>a.n-b.n);
 const blob=keys.map(e=>env[e.k]).join('');
 const out={};
 for(let i=0,start=0;start<blob.length;i++,start+=size)
  out['CAMOU_CONFIG_'+(i+1)]=blob.slice(start,start+size);
 return out;
}

function identityEnvForProfile(profile){
 const identity=profile?.fingerprint?.identity;
 if(identity===undefined||identity===null)return null;
 const {expectations}=validateStoredIdentity(identity);
 // Replay the generator's blob byte-for-byte, re-sliced to Windows-safe
 // chunk sizes; the engine concatenates the chunks in numeric order.
 return {env:rechunkCamouConfigEnv(identity.env),expectations};
}

function assertIdentityMatchesProfile(profile,expectations){
 const fingerprint=isRecord(profile?.fingerprint)?profile.fingerprint:{};
 const problems=[];
 const uaFamilyOf=uaFamily(expectations.userAgent||'');
 if(fingerprint.os&&uaFamilyOf&&fingerprint.os!==uaFamilyOf)
  problems.push('identity user agent OS contradicts the profile OS');
 const platformFamilyOf=platformFamily(expectations.platform);
 if(fingerprint.os&&platformFamilyOf&&fingerprint.os!==platformFamilyOf)
  problems.push('identity platform contradicts the profile OS');
 if(fingerprint.platform&&expectations.platform&&
    fingerprint.platform!==expectations.platform)
  problems.push('identity platform contradicts the declared platform');
 if(fingerprint.userAgent&&expectations.userAgent&&
    fingerprint.userAgent!==expectations.userAgent)
  problems.push('identity user agent contradicts the declared user agent');
 if(fingerprint.timezone&&expectations.timezone&&
    fingerprint.timezone!==expectations.timezone)
  problems.push('identity timezone contradicts the declared timezone');
 if(Array.isArray(fingerprint.languages)&&fingerprint.languages.length&&
    expectations.language&&
    !fingerprint.languages.some(l=>l===expectations.language||
     expectations.language.startsWith(l.split('-')[0]+'-')&&l.split('-')[0]===expectations.language.split('-')[0]))
  problems.push('identity language contradicts the declared languages');
 const screen=fingerprint.screen;
 if(isRecord(screen)){
  if(Number.isInteger(screen.width)&&Number.isInteger(expectations.screenWidth)&&
     screen.width!==expectations.screenWidth)
   problems.push('identity screen width contradicts the declared screen');
  if(Number.isInteger(screen.height)&&Number.isInteger(expectations.screenHeight)&&
     screen.height!==expectations.screenHeight)
   problems.push('identity screen height contradicts the declared screen');
 }
 if(problems.length)
  throw Error('CAMOUFOX_IDENTITY_MISMATCH: '+problems.join('; '));
 return true;
}

module.exports={IDENTITY_FORMAT,IDENTITY_VERSION,EXPECTATION_KEYS,
 REPLAY_CHUNK_LENGTH,parseCamouConfigEnv,summarizeIdentity,
 validateStoredIdentity,rechunkCamouConfigEnv,
 identityEnvForProfile,assertIdentityMatchesProfile};
