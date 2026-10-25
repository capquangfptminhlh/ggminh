'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto');
const {GoogleBrowserDesktopClient,BrowserSaasError}=
 require('../src/licensing/googleDesktopClient');
const {canonicalClaims,PREFIX}=require('../src/licensing/googleLease');
const origin='https://browser-staging.lhmcrm.com';
const privatePair=crypto.generateKeyPairSync('ed25519');
const customerId='e02ab0e4-c2b0-4a23-99a1-acd430b37fea';
let now=Date.parse('2026-10-25T10:00:00.000Z');
const grant='bg1_'+crypto.randomBytes(32).toString('base64url');
const pairId='11111111-1111-4111-a111-111111111111';
const code='294617',seatId='seat_12345678901234567890';
let verifierHash=null,expectedHash=null;
let heartbeatFailed=false,grantRevoked=false;
const replies=[];
const mockSafeStorage={
 isEncryptionAvailable(){return true;},
 encryptString(text){return Buffer.from('TEST_DPAPI::'+Buffer.from(text).toString('base64'));},
 decryptString(buffer){
  const raw=buffer.toString();if(!raw.startsWith('TEST_DPAPI::'))throw Error('Invalid fixture encryption');
  return Buffer.from(raw.slice('TEST_DPAPI::'.length),'base64').toString();
 }
};
function jwtLease(hash,seat=seatId){
 const claims={
  audience:'lhm-ads-browser-windows',client_hash:hash,customer_id:customerId,
  features:['api','automation','profiles'],issued_at:new Date(now).toISOString(),
  max_profiles:100,plan_code:'personal_30',product_code:'ads-browser',
  seat_id:seat,seat_limit:2,subscription_expires_at:new Date(now+30*86400000).toISOString(),
  valid_until:new Date(now+72*3600000).toISOString()
 };
 const head=PREFIX+'.'+Buffer.from(canonicalClaims(claims)).toString('base64url');
 return head+'.'+crypto.sign(null,Buffer.from(head),privatePair.privateKey).toString('base64url');
}
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
async function fetchImpl(url,init){
 assert(url.startsWith(origin+'/v2/'),'requests must be same pinned origin');
 assert.equal(init.method,'POST');
 const body=JSON.parse(init.body);
 const endpoint=new URL(url).pathname;
 const auth=init.headers.Authorization;
 replies.push(endpoint);
 if(endpoint==='/v2/desktop/pair/start'){
  assert(/^[a-f0-9]{64}$/.test(body.client_hash));
  assert(/^[a-f0-9]{64}$/.test(body.verifier_hash));
  expectedHash=body.client_hash;verifierHash=body.verifier_hash;
  return reply(201,{pairing_id:pairId,comparison_code:code,
   approval_url:origin+'/v2/desktop/pair/?id='+pairId,expires_at_ms:now+600000});
 }
 if(endpoint==='/v2/desktop/pair/claim'){
  assert.equal(crypto.createHash('sha256').update(body.verifier).digest('hex'),verifierHash);
  return reply(200,{grant,customer_id:customerId,email:'verified@gmail.com',client_hash:expectedHash});
 }
 assert.equal(auth,'Bearer '+grant,'authenticated operation requires secret desktop grant');
 if(endpoint==='/v2/desktop/grant/revoke')return reply(200,{status:'revoked'});
 if(endpoint==='/v2/seats/attach')return reply(200,{seat_id:seatId});
 if(endpoint==='/v2/seats/list')return reply(200,{seat_limit:2,devices:[{seat_id:seatId,label:'PC one'}]});
 if(endpoint==='/v2/leases/issue')return reply(200,{lease:jwtLease(expectedHash)});
 if(endpoint==='/v2/seats/heartbeat')return grantRevoked?
  reply(401,{error:'DESKTOP_GRANT_INVALID'}):heartbeatFailed?
  reply(409,{error:'SEAT_EXPIRED'}):reply(200,{status:'active'});
 return reply(404,{error:'not_found'});
}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ggminh-desktop-'));
 try{
  assert.throws(()=>new GoogleBrowserDesktopClient({
   root,safeStorage:{...mockSafeStorage,isEncryptionAvailable:()=>false},
   apiOrigin:origin,publicKey:privatePair.publicKey,fetchImpl}),/DPAPI/);
  assert.throws(()=>new GoogleBrowserDesktopClient({
   root,safeStorage:mockSafeStorage,apiOrigin:'https://evil.example',
   publicKey:privatePair.publicKey,fetchImpl}),/allowlisted/);
  let desktop=new GoogleBrowserDesktopClient({root,safeStorage:mockSafeStorage,
   apiOrigin:origin,publicKey:privatePair.publicKey,fetchImpl,clock:()=>now});
  assert.equal(desktop.status().allowed,false);
  assert.throws(()=>desktop.require('profiles'),BrowserSaasError);
  const pairing=await desktop.startPair({label:'PC one'});
  assert.equal(pairing.comparisonCode,code);
  assert(pairing.approvalUrl.endsWith('/v2/desktop/pair/?id='+pairId));
  const paired=await desktop.claimPair();
  assert.equal(paired.customerId,customerId);
  assert.equal(paired.email,'verified@gmail.com');
  assert.equal(desktop.state.email,'verified@gmail.com');
  assert.equal(desktop.state.pending,null);
  assert.equal(desktop.status().allowed,false,'paired but unpaid seat cannot launch profiles');
  await desktop.attach({label:'PC one'});
  assert.equal((await desktop.listSeats()).devices[0].seatId,seatId);
  assert.equal(desktop.status().allowed,false,'seat alone does not authorize launch');
  const activated=await desktop.refreshLease();
  assert.equal(activated.maxProfiles,100);
  assert.equal(desktop.status().allowed,true);
  assert.equal(desktop.require('api').seatLimit,2);
  assert.equal(desktop.assertCapacity(99,1).maxProfiles,100);
  assert.throws(()=>desktop.assertCapacity(100,1),/PROFILE_LIMIT/);
  const file=fs.readFileSync(path.join(root,'browser-google-saas-v2.enc'),'utf8');
  assert(!file.includes(grant),'grant must not be stored as plaintext');
  assert(!file.includes('lhmbrlease1'),'lease should be encrypted at rest');
  // Fresh application process recovers only the encrypted grant and valid signed lease.
  desktop=new GoogleBrowserDesktopClient({root,safeStorage:mockSafeStorage,
   apiOrigin:origin,publicKey:privatePair.publicKey,fetchImpl,clock:()=>now});
  assert.equal(desktop.status().allowed,true);
  // Connectivity interruption never extends the 72h cryptographic lease.
  desktop.fetch=async()=>{throw Error('Disconnected');};
  await assert.rejects(()=>desktop.heartbeat(),/NETWORK_UNAVAILABLE/);
  assert.equal(desktop.status().allowed,true);
  await assert.rejects(()=>desktop.logout(),/NETWORK_UNAVAILABLE/);
  assert.equal(desktop.state.grant,grant,'offline logout must not silently retain server grant');
  now+=72*3600000;
  assert.equal(desktop.status().allowed,false,'72h expiry blocks operation offline');
  assert.throws(()=>desktop.require('profiles'),/LEASE_INVALID_OR_EXPIRED/);
  // No backdating the system clock to reuse an expired lease.
  now-=73*3600000;
  assert.equal(desktop.status().allowed,false);
  assert.equal(desktop.status().reason,'CLOCK_ROLLBACK');
  now+=74*3600000;
  // A direct online confirmation of a lost seat blocks immediately, even
  // while an earlier signed lease could otherwise still be within its TTL.
  desktop.fetch=fetchImpl;
  const restored=await desktop.renewOnline({label:'PC one'});
  assert.equal(restored.maxProfiles,100,'expired signed lease can be reissued if paid');
  assert.equal(desktop.status().allowed,true);
  heartbeatFailed=true;
  const woke=await desktop.renewOnline({label:'PC one'});
  assert.equal(woke.maxProfiles,100,'expired idle seat recovers without account re-pair');
  assert.equal(desktop.status().allowed,true);
  heartbeatFailed=false;
  grantRevoked=true;
  await assert.rejects(()=>desktop.heartbeat(),/DESKTOP_GRANT_INVALID/);
  assert.equal(desktop.status().allowed,false);
  assert.equal(desktop.status().reason,'SEAT_REPLACED');
  assert.throws(()=>desktop.forgetGrant(false),/CONFIRMATION_REQUIRED/);
  assert.deepEqual(await desktop.logout(),{revoked:true},'server must confirm grant revocation');
  assert(replies.includes('/v2/desktop/grant/revoke'));
  assert.equal(desktop.state.grant,null);
  assert.equal(desktop.state.email,null,'logout removes locally cached email');
  assert.equal(desktop.status().allowed,false);
  assert.equal(fs.existsSync(path.join(root,'profiles')),false,
   'logout must never create/delete a profile workspace');
  assert(replies.includes('/v2/desktop/pair/start')&&replies.includes('/v2/leases/issue'));
  console.log('PASS: Windows main-only pairing, pinning, encrypted grant and lease, profile capacity, restart recovery, 72h offline, clock rollback, online seat rejection and server-confirmed logout');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
