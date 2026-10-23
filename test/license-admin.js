'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {addCustomer,issue,readLedger,recordRevocation,due,summary,addMonths}=require('../src/licensing/customerLedger');
const {commands}=require('../tools/license-admin');
const {LicenseManager,verifyLicense}=require('../src/licensing/manager');
const {makeAuthority,readRegistry}=require('../src/licensing/authority');
(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-admin-v54-'));
 let server;
 try{
  const file=path.join(base,'private-ledger.json');
  const registry=path.join(base,'private-revocations.json');
  const keys=crypto.generateKeyPairSync('ed25519');
  const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  const password='private-ci-passphrase-only';
  const pem=path.join(base,'private-issuer.pem');
  fs.writeFileSync(pem,keys.privateKey.export({format:'pem',type:'pkcs8',
   cipher:'aes-256-cbc',passphrase:password}),{mode:0o600});
  let now=Date.parse('2026-10-20T09:00:00.000Z');
  const clock=()=>now;
  const installed=new LicenseManager(path.join(base,'client'),{publicKey,clock});
  const env={LHM_ISSUER_PASSPHRASE:password};
  const cust=commands(['add',file,'Local Customer',installed.installationId],{now:clock});
  assert(cust.id.startsWith('cust_'));
  assert.strictEqual(readLedger(file).customers.length,1);
  assert.throws(()=>addCustomer(file,'Another',installed.installationId,{now:clock}),/already belongs/);
  assert.throws(()=>commands(['issue',file,cust.id,'pro','1','40',pem],
   {now:clock,env:{LHM_ISSUER_PASSPHRASE:'wrong-password-2026'},publicKey}),/Wrong issuer/);
  assert.strictEqual(readLedger(file).licenses.length,0,'Wrong private key password cannot write ledger');
  const signed=commands(['issue',file,cust.id,'pro','1','40',pem],
   {now:clock,env,publicKey});
  const old=verifyLicense(signed.token,publicKey);
  assert.strictEqual(old.installationId,installed.installationId);
  assert.strictEqual(old.plan,'pro');
  assert.strictEqual(old.maxProfiles,40);
  assert(!JSON.stringify(readLedger(file)).includes(signed.token),
   'Ledger must never save full activation tokens');
  assert.strictEqual(summary(file).customers,1);
  assert.strictEqual(summary(file).issued,1);
  assert.deepStrictEqual(due(file,14,{now:clock}),[]);
  const expires=new Date(old.expiresAt);
  now=expires.getTime()-8*86400000;
  assert.strictEqual(commands(['due',file,'14'],{now:clock}).length,1);
  const extended=commands(['renew',file,old.licenseId,'2',pem],
   {now:clock,env,publicKey});
  const updated=verifyLicense(extended.token,publicKey);
  assert.strictEqual(updated.installationId,old.installationId);
  assert.strictEqual(updated.plan,'pro');
  assert.strictEqual(updated.maxProfiles,40);
  assert.strictEqual(extended.record.renewalOf,old.licenseId);
  assert(Date.parse(updated.expiresAt)>Date.parse(old.expiresAt));
  assert.strictEqual(readLedger(file).licenses.length,2);
  assert.strictEqual(readLedger(file).events.length,3);
  assert.throws(()=>commands(['renew',file,'lic_'+('f'.repeat(24)),'1',pem],
   {now:clock,env,publicKey}),/not found/);
  assert.strictEqual(readLedger(file).licenses.length,2,'No mutation if reference not found');
  assert.throws(()=>commands(['issue',file,cust.id,'unknown','1','30',pem],
   {now:clock,env,publicKey}),/Invalid license issuance/);
  assert.throws(()=>commands(['issue',file,cust.id,'pro','13','30',pem],
   {now:clock,env,publicKey}),/Invalid license issuance/);
  assert.throws(()=>commands(['issue',file,cust.id,'pro','1','0',pem],
   {now:clock,env,publicKey}),/Invalid license issuance/);
  assert.throws(()=>commands(['issue',file,cust.id,'pro','1','40',pem],
   {now:clock,env,publicKey:crypto.generateKeyPairSync('ed25519').publicKey}),/signature/);
  assert.strictEqual(readLedger(file).licenses.length,2);
  assert.strictEqual(addMonths(new Date('2026-01-31T00:00:00Z'),1).toISOString(),
   '2026-02-28T00:00:00.000Z');
  // Issued tokens can be verified by the optional online authority.
  server=makeAuthority({privateKey:keys.privateKey,publicKey,registryFile:registry,clock,
   sweepHealth:{healthy:true,lastRunAt:now}});
  await new Promise((resolve,reject)=>{server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);});
  const url='http://127.0.0.1:'+server.address().port+'/v1/verify';
  async function lookup(token){
   const nonce=crypto.randomBytes(16).toString('base64url');
   const response=await fetch(url,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({version:1,token,nonce})});
   assert.strictEqual(response.status,200);
   const receipt=await response.json();
   return require('../src/licensing/receipts').verifyReceipt(receipt.receipt,{
    publicKey,nonce,installationId:installed.installationId,
    licenseId:verifyLicense(token,publicKey).licenseId,now
   }).state;
  }
  assert.strictEqual(await lookup(extended.token),'valid');
  commands(['revoke',file,registry,updated.licenseId],{now:clock});
  assert(readRegistry(registry).revoked.includes(updated.licenseId));
  assert.strictEqual(await lookup(extended.token),'revoked');
  assert.strictEqual(readLedger(file).licenses.find(x=>x.licenseId===updated.licenseId).revoked,true);
  commands(['allow',file,registry,updated.licenseId],{now:clock});
  assert.strictEqual(await lookup(extended.token),'valid');
  assert.strictEqual(readLedger(file).events.length,5);
  assert.throws(()=>commands(['revoke',file,registry,'lic_'+('0'.repeat(24))],{now:clock}),/not found/);
  assert.strictEqual(readRegistry(registry).revoked.length,0);
  const lock=file+'.lock';
  fs.writeFileSync(lock,'lock');
  assert.throws(()=>addCustomer(file,'Cannot Save',crypto.randomUUID(),{now:clock}),/locked/);
  fs.unlinkSync(lock);
  assert.strictEqual(readLedger(file).customers.length,1);
  const json=fs.readFileSync(file,'utf8');
  assert(!json.includes(extended.token));
  assert(!json.includes(password));
  assert(!json.includes('PRIVATE KEY'));
  assert(!json.includes('Cookies'));
  // Exact-day rentals retain the existing token format and owner-sweep default.
  const dayFile=path.join(base,'exact-day-ledger.json');
  const dayCustomer=addCustomer(dayFile,'Day rental',crypto.randomUUID(),{now:clock});
  const dayOptions={customerId:dayCustomer.id,plan:'pro',maxProfiles:40,
   privateKey:keys.privateKey,publicKey,now:clock};
  for(const [start,expected] of [
   ['2026-10-20T09:00:00.000Z','2026-11-19T09:00:00.000Z'],
   ['2027-02-01T09:00:00.000Z','2027-03-03T09:00:00.000Z'],
   ['2028-02-01T09:00:00.000Z','2028-03-02T09:00:00.000Z']
  ]){
   now=Date.parse(start);
   const rental=issue(dayFile,{...dayOptions,days:30});
   const rentalClaims=verifyLicense(rental.token,publicKey);
   assert.strictEqual(rentalClaims.expiresAt,expected);
   assert.strictEqual(rentalClaims.enforcementMode,'owner_sweep');
   assert.strictEqual(rentalClaims.version,2);
   assert.strictEqual(Date.parse(rentalClaims.expiresAt)-Date.parse(rentalClaims.issuedAt),30*86400000);
  }
  now=Date.parse('2026-10-20T09:00:00.000Z');
  const firstRental=issue(dayFile,{...dayOptions,days:30});
  now+=10*86400000;
  const earlyRenewal=issue(dayFile,{...dayOptions,days:30,renewFrom:firstRental.record.licenseId});
  assert.strictEqual(earlyRenewal.record.expiresAt,'2026-12-19T09:00:00.000Z');
  assert.strictEqual(earlyRenewal.record.renewalOf,firstRental.record.licenseId);
  now=Date.parse('2027-01-01T09:00:00.000Z');
  assert.strictEqual(issue(dayFile,{...dayOptions,days:30,renewFrom:firstRental.record.licenseId})
   .record.expiresAt,'2027-01-31T09:00:00.000Z');
  for(const days of [1,365])assert.strictEqual(Date.parse(issue(dayFile,{...dayOptions,days})
   .record.expiresAt)-now,days*86400000);
  const beforeInvalid=fs.readFileSync(dayFile,'utf8');
  for(const days of [0,-1,366,1.5,NaN,Infinity,'30',null])
   assert.throws(()=>issue(dayFile,{...dayOptions,days}),/Invalid license issuance/);
  assert.throws(()=>issue(dayFile,{...dayOptions}),/Invalid license issuance/);
  assert.throws(()=>issue(dayFile,{...dayOptions,days:30,months:1}),/Invalid license issuance/);
  assert.throws(()=>issue(dayFile,{...dayOptions,days:30,months:null}),/Invalid license issuance/);
  const longRental=readLedger(dayFile).licenses.at(-1);
  assert.throws(()=>issue(dayFile,{...dayOptions,days:30,renewFrom:longRental.licenseId}),/370-day/);
  assert.strictEqual(fs.readFileSync(dayFile,'utf8'),beforeInvalid,'Rejected durations do not mutate the ledger');
  now=Date.parse('2028-01-31T09:00:00.000Z');
  assert.strictEqual(issue(dayFile,{...dayOptions,months:1}).record.expiresAt,
   '2028-02-29T09:00:00.000Z','Legacy ledger month clamp is unchanged');
  const dailyCli=commands(['issue',dayFile,dayCustomer.id,'pro','--days','30','40',pem],
   {now:clock,env,publicKey});
  assert.strictEqual(dailyCli.record.expiresAt,'2028-03-01T09:00:00.000Z');
  assert.strictEqual(dailyCli.record.enforcementMode,'owner_sweep');
  const dailyRenewed=commands(['renew',dayFile,dailyCli.record.licenseId,'--days','30',pem],
   {now:clock,env,publicKey});
  assert.strictEqual(dailyRenewed.record.expiresAt,'2028-03-31T09:00:00.000Z');
  assert.strictEqual(dailyRenewed.record.enforcementMode,'owner_sweep');
  assert.strictEqual(commands(['issue',dayFile,dayCustomer.id,'pro','--days','30','40',pem,'strict'],
   {now:clock,env,publicKey}).record.enforcementMode,'strict');
  for(const duration of ['0','366','1.5','nope']){
   assert.throws(()=>commands(['issue',dayFile,dayCustomer.id,'pro','--days',duration,'40',pem],
    {now:clock,env,publicKey}),/Invalid license issuance/);
   assert.throws(()=>commands(['renew',dayFile,dailyCli.record.licenseId,'--days',duration,pem],
    {now:clock,env,publicKey}),/Invalid license issuance/);
  }
  assert.throws(()=>commands(['issue',dayFile,dayCustomer.id,'pro','1','--days','30','40',pem],
   {now:clock,env,publicKey}),/Usage/);
  assert.throws(()=>commands(['renew',dayFile,dailyCli.record.licenseId,'1','--days','30',pem],
   {now:clock,env,publicKey}),/Usage/);
  console.log('v5.4 admin ledger: customer enrollment, signed issue/renew, expiry alerts, registry revocation, loopback server and audit passed');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(base,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
