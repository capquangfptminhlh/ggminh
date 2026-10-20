#!/usr/bin/env node
'use strict';
// Local administrator terminal only. No remotely accessible issuance API.
// Keep the private key and ledger outside the repository and customer installers.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ledger=require('../src/licensing/customerLedger');
const {changeRevocation,readRegistry}=require('../src/licensing/authority');
function issuerKey(file,env){
 if(!file||!path.isAbsolute(file))throw Error('Absolute encrypted private key path required');
 if(!env.LHM_ISSUER_PASSPHRASE||env.LHM_ISSUER_PASSPHRASE.length<12)
  throw Error('Set private LHM_ISSUER_PASSPHRASE before issuing');
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>25000)
  throw Error('Issuer key must be a private regular file');
 try{return crypto.createPrivateKey({
  key:fs.readFileSync(file),format:'pem',passphrase:env.LHM_ISSUER_PASSPHRASE
 });}
 catch(_){throw Error('Wrong issuer private key or password');}
}
function commands(argv=process.argv.slice(2),{env=process.env,now=()=>Date.now(),publicKey}={}){
 const cmd=argv[0],filename=argv[1];
 if(!filename||!path.isAbsolute(filename))
  throw Error('Supply an absolute ledger path outside GitHub');
 if(cmd==='add'){
  if(argv.length!==4)throw Error('Usage: add LEDGER CUSTOMER_NAME INSTALLATION_ID');
  return ledger.addCustomer(filename,argv[2],argv[3],{now});
 }
 if(cmd==='issue'){
  if(argv.length!==7)
   throw Error('Usage: issue LEDGER CUSTOMER_ID starter|pro|business MONTHS MAX_PROFILES PRIVATE_PEM');
  const signed=ledger.issue(filename,{
   customerId:argv[2],plan:argv[3],months:Number(argv[4]),
   maxProfiles:Number(argv[5]),privateKey:issuerKey(argv[6],env),
   ...(publicKey?{publicKey}:{}),now
  });
  return {token:signed.token,record:signed.record};
 }
 if(cmd==='renew'){
  if(argv.length!==5)throw Error('Usage: renew LEDGER OLD_LICENSE_ID MONTHS PRIVATE_PEM');
  const record=ledger.readLedger(filename).licenses.find(x=>x.licenseId===argv[2]);
  if(!record)throw Error('Prior license not found');
  const signed=ledger.issue(filename,{
   customerId:record.customerId,plan:record.plan,months:Number(argv[3]),
   maxProfiles:record.maxProfiles,renewFrom:record.licenseId,
   privateKey:issuerKey(argv[4],env),...(publicKey?{publicKey}:{}),now
  });
  return {token:signed.token,record:signed.record};
 }
 if(cmd==='revoke'||cmd==='allow'){
  if(argv.length!==4)throw Error('Usage: revoke|allow LEDGER REGISTRY LICENSE_ID');
  // The registry is authoritative. A missing ledger row is rejected before
  // changing the server's revocation state.
  const lic=ledger.readLedger(filename).licenses.find(x=>x.licenseId===argv[3]);
  if(!lic)throw Error('License ID not found in ledger');
  const registry=argv[2];
  if(!path.isAbsolute(registry)||path.resolve(registry)===path.resolve(filename))
   throw Error('Private registry file must be separate from ledger');
  const revoked=cmd==='revoke';
  const state=changeRevocation(registry,lic.licenseId,revoked);
  // Two separate files: failure here must be surfaced for manual reconciliation.
  ledger.recordRevocation(filename,lic.licenseId,revoked,{now});
  return state;
 }
 if(cmd==='due'){
  if(argv.length>3)throw Error('Usage: due LEDGER [DAYS]');
  return ledger.due(filename,argv[2]===undefined?14:Number(argv[2]),{now});
 }
 if(cmd==='report'){
  if(argv.length!==2)throw Error('Usage: report LEDGER');
  return ledger.summary(filename);
 }
 throw Error('Commands: add, issue, renew, revoke, allow, due, report');
}
if(require.main===module){
 try{
  const value=commands();
  // Signed token is printed ONCE, never recorded in the ledger.
  console.log(JSON.stringify(value,null,2));
 }catch(error){console.error('License admin:',error.message);process.exitCode=1;}
}
module.exports={commands,issuerKey};
