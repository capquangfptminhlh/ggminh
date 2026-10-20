'use strict';
const assert=require('assert');
const crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const {createCloudService}=require('../src/sync/cloudService');
const {CloudClient,endpoint}=require('../src/sync/cloudClient');
const {encryptMetadata}=require('../src/sync/encryptedMetadata');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-cloud-'));
 const tokens=Array.from({length:4},()=>crypto.randomBytes(48).toString('base64url'));
 const [owner,reader,outsider,pending]=tokens;
 let now=Date.UTC(2026,9,21);
 const actors=[
  {subjectId:'ownerA',verifiedEmail:'owner@example.com',tokenHash:hash(owner)},
  {subjectId:'readerA',verifiedEmail:'reader@example.com',tokenHash:hash(reader)},
  {subjectId:'ownerB',verifiedEmail:'other@example.com',tokenHash:hash(outsider)},
  {subjectId:'pendingA',verifiedEmail:'join@example.com',tokenHash:hash(pending)}
 ];
 const initialMemberships=[
  {tenantId:'tenantA',subjectId:'ownerA',role:'owner',groups:['*'],status:'active'},
  {tenantId:'tenantA',subjectId:'readerA',role:'viewer',groups:['*'],status:'active'},
  {tenantId:'tenantB',subjectId:'ownerB',role:'owner',groups:['*'],status:'active'}
 ];
 const {app}=createCloudService({storageDir:directory,actors,initialMemberships,now:()=>now});
 const server=await new Promise(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 const origin='http://127.0.0.1:'+server.address().port;
 const req=(token,method,route,body)=>fetch(origin+route,{
  method,headers:{Authorization:'Bearer '+token,
   ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const mockHttps=(url,options)=>{
  assert(url.startsWith('https://cloud.example.test/'));
  return fetch(origin+new URL(url).pathname,options);
 };
 try{
  assert.throws(()=>endpoint('http://cloud.example.test'));
  assert.throws(()=>endpoint('https://user:secret@cloud.example.test'));
  assert.throws(()=>endpoint('https://cloud.example.test/foo'));
  const admin=new CloudClient({baseUrl:'https://cloud.example.test',
   token:owner,tenantId:'tenantA',deviceId:'device1'},{fetcher:mockHttps});
  const client2=new CloudClient({baseUrl:'https://cloud.example.test',
   token:reader,tenantId:'tenantA',deviceId:'device2'},{fetcher:mockHttps});
  assert((await admin.listMembers()).some(x=>x.subjectId==='ownerA'));
  await assert.rejects(()=>client2.listMembers(),/Team permission denied/);
  const serviceInvite=await admin.issueInvite({email:'future@example.com',
   role:'operator',groups:['*'],ttlHours:24});
  assert(serviceInvite.token&&serviceInvite.id);
  const passphrase='very-long-test-passphrase-2026';
  const sample=[{id:'profile1',name:'Work',group:'Default',engine:'chromium',
   tags:['ok'],cookie:'SESSION_SECRET',proxy:{password:'PROXY_SECRET'}}];
  assert.deepStrictEqual(await admin.pull(passphrase),
   {revision:0,profiles:[],empty:true});
  const first=await admin.push(passphrase,sample);
  assert.strictEqual(first.revision,1);
  const raw=fs.readFileSync(path.join(directory,'cloud-state.json'),'utf8');
  assert(!raw.includes('SESSION_SECRET')&&!raw.includes('PROXY_SECRET'));
  assert(!raw.includes(owner)&&!raw.includes(reader)&&!raw.includes(pending));
  const pulled=await client2.pull(passphrase);
  assert.strictEqual(pulled.revision,1);
  assert.strictEqual(pulled.profiles[0].name,'Work');
  assert(!Object.hasOwn(pulled.profiles[0],'cookie'));
  await assert.rejects(()=>client2.push(passphrase,sample),/permission denied/);
  const outsiderResponse=await req(outsider,'GET','/v1/workspaces/tenantA/sync');
  assert.strictEqual(outsiderResponse.status,403);
  const maliciousResponse=await req(owner,'GET','/v1/workspaces/tenantB/sync');
  assert.strictEqual(maliciousResponse.status,403);
  const noAuth=await fetch(origin+'/v1/workspaces/tenantA/sync');
  assert.strictEqual(noAuth.status,401);
  const crossOrigin=await fetch(origin+'/v1/workspaces/tenantA/sync',
   {headers:{Authorization:'Bearer '+owner,Origin:'https://evil.test'}});
  assert.strictEqual(crossOrigin.status,403);
  const two=encryptMetadata({tenantId:'tenantA',deviceId:'device1',
   revision:2,profiles:sample,passphrase});
  const good=await req(owner,'PUT','/v1/workspaces/tenantA/sync',
   {expectedRevision:1,envelope:two});
  assert.strictEqual(good.status,201);
  const conflict=await req(owner,'PUT','/v1/workspaces/tenantA/sync',
   {expectedRevision:1,envelope:two});
  assert.strictEqual(conflict.status,409);
  const badEnv=await req(owner,'PUT','/v1/workspaces/tenantA/sync',
   {expectedRevision:2,envelope:{...two,revision:3,extra:'unwanted'}});
  assert.strictEqual(badEnv.status,400);
  const pendingDenied=await req(pending,'GET','/v1/workspaces/tenantA/sync');
  assert.strictEqual(pendingDenied.status,403);
  const inviteResponse=await req(owner,'POST','/v1/workspaces/tenantA/invites',{
   email:'join@example.com',role:'viewer',groups:['*'],ttlHours:1
  });
  assert.strictEqual(inviteResponse.status,201);
  const invitation=await inviteResponse.json();
  assert(!JSON.stringify(fs.readFileSync(path.join(directory,'cloud-state.json'),'utf8'))
   .includes(invitation.token));
  const mismatched=await req(outsider,'POST',
   '/v1/workspaces/tenantA/invites/redeem',{token:invitation.token});
  assert.strictEqual(mismatched.status,400);
  const recipient=new CloudClient({baseUrl:'https://cloud.example.test',
   token:pending,tenantId:'tenantA',deviceId:'device3'},{fetcher:mockHttps});
  const redeem=await recipient.redeemInvite(invitation.token);
  assert.strictEqual(redeem.role,'viewer');
  const nowMember=await req(pending,'GET','/v1/workspaces/tenantA/sync');
  assert.strictEqual(nowMember.status,200);
  const members=await req(owner,'GET','/v1/workspaces/tenantA/members');
  assert.strictEqual(members.status,200);
  assert((await members.json()).members.some(x=>x.subjectId==='pendingA'));
  const revocation=await admin.revokeMember('pendingA');
  assert.strictEqual(revocation.revoked,true);
  const afterRevocation=await req(pending,'GET','/v1/workspaces/tenantA/sync');
  assert.strictEqual(afterRevocation.status,403);
  const audit=await req(owner,'GET','/v1/workspaces/tenantA/audit');
  assert.strictEqual(audit.status,200);
  assert((await audit.json()).events.some(e=>e.event==='team.member.revoked'));
  const reloaded=createCloudService({storageDir:directory,actors,initialMemberships});
  assert.strictEqual(reloaded.readState().sync.tenantA.revision,2);
  assert(reloaded.readState().memberships.some(m=>m.subjectId==='pendingA'&&m.status==='revoked'));
  console.log('Cloud HTTPS client + HTTP test service: ciphertext, auth, tenants, team invite, revocation, persistence and CAS passed');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(directory,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
