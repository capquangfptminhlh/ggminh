#!/usr/bin/env node
'use strict';
// Issuer is not part of the shipped Electron app. Never commit the private key.
// Passphrase is read from LHM_ISSUER_PASSPHRASE, not process arguments.
const fs=require('fs'),crypto=require('crypto');
const {signLicense,verifyLicense,PUBLIC_KEY}=require('../src/licensing/manager');
function cli(argv=process.argv.slice(2),env=process.env){
 const values={};
 for(let i=0;i<argv.length;i+=2){
  if(!/^--[a-z-]+$/.test(argv[i])||!argv[i+1]||values[argv[i]])throw Error('Invalid issuer arguments');
  values[argv[i]]=argv[i+1];
 }
 for(const k of Object.keys(values))
  if(!['--key','--installation','--customer','--plan','--months','--max-profiles'].includes(k))
   throw Error('Unknown issuer argument: '+k);
 for(const k of ['--key','--installation','--customer','--plan','--months'])
  if(!values[k])throw Error('Missing '+k);
 const months=Number(values['--months']);
 if(!Number.isInteger(months)||months<1||months>12)throw Error('Months must be 1–12');
 const maxProfiles=Number(values['--max-profiles']||100);
 if(!Number.isInteger(maxProfiles)||maxProfiles<1||maxProfiles>10000)
  throw Error('Profile cap must be 1–10000');
 if(!env.LHM_ISSUER_PASSPHRASE||env.LHM_ISSUER_PASSPHRASE.length<12)
  throw Error('Set LHM_ISSUER_PASSPHRASE in your private terminal');
 const pem=fs.readFileSync(values['--key'],'utf8');
 let privateKey;
 try{privateKey=crypto.createPrivateKey({key:pem,format:'pem',passphrase:env.LHM_ISSUER_PASSPHRASE});}
 catch(_){throw Error('Issuer key or passphrase invalid');}
 const now=new Date(),end=new Date(now);
 end.setUTCMonth(end.getUTCMonth()+months);
 const plans={
  starter:['profiles'],
  pro:['api','automation','profiles'],
  business:['api','automation','profiles']
 };
 if(!Object.hasOwn(plans,values['--plan']))throw Error('Invalid subscription plan');
 const claims={version:1,licenseId:'lic_'+crypto.randomBytes(12).toString('hex'),
  customer:values['--customer'],installationId:values['--installation'],
  plan:values['--plan'],maxProfiles,features:plans[values['--plan']],
  issuedAt:now.toISOString(),expiresAt:end.toISOString()};
 const token=signLicense(claims,privateKey);
 verifyLicense(token,PUBLIC_KEY);
 return {token,expiresAt:claims.expiresAt,installationId:claims.installationId};
}
if(require.main===module){
 try{const x=cli();console.log(x.token);console.error('Expires: '+x.expiresAt);}
 catch(error){console.error('License issuer: '+error.message);process.exitCode=1;}
}
module.exports={cli};
