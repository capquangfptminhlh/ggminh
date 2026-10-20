#!/usr/bin/env node
'use strict';
// Put behind a TLS-terminating reverse proxy, never bind direct public HTTP.
// Private issuer PKCS#8 key stays on server filesystem and encrypted at rest.
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const {makeAuthority}=require('../src/licensing/authority');
function start(env=process.env){
 const filename=env.LHM_ISSUER_KEY_PATH,passphrase=env.LHM_ISSUER_PASSPHRASE;
 const registryFile=env.LHM_LICENSE_REGISTRY_PATH;
 if(!filename||!registryFile||!passphrase||passphrase.length<12)
  throw Error('Set LHM_ISSUER_KEY_PATH, LHM_ISSUER_PASSPHRASE and LHM_LICENSE_REGISTRY_PATH');
 const privateKey=crypto.createPrivateKey({
  key:fs.readFileSync(filename),format:'pem',passphrase
 });
 const server=makeAuthority({privateKey,registryFile:path.resolve(registryFile)});
 const port=Number(env.LHM_LICENSE_AUTHORITY_PORT||8787);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be 1024–65535');
 server.listen(port,'127.0.0.1',()=>console.log('License authority bound to loopback port '+port));
 return server;
}
if(require.main===module){
 try{start();}
 catch(error){console.error('Cannot start license authority:',error.message);process.exitCode=1;}
}
module.exports={start};
