'use strict';
// Standalone HTTPS-only Cloud API. NEVER embed this server in customer Electron.
// Provision random 32+ byte bearer secrets out of band; persist only SHA-256 digests.
const fs=require('fs'),https=require('https'),path=require('path');
const {createCloudService}=require('../src/sync/cloudService');
function required(name){
 const value=process.env[name];
 if(!value)throw Error('Missing environment variable: '+name);
 return value;
}
function regularFile(filename){
 const resolved=path.resolve(filename);
 const stat=fs.lstatSync(resolved);
 if(!stat.isFile()||stat.isSymbolicLink())
  throw Error('Configuration and TLS secrets must be regular files');
 return resolved;
}
function start(){
 const configPath=regularFile(required('LHM_CLOUD_ACTORS_FILE'));
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const stateDir=path.resolve(required('LHM_CLOUD_DATA_DIR'));
 const tlsCert=fs.readFileSync(regularFile(required('LHM_CLOUD_TLS_CERT')));
 const tlsKey=fs.readFileSync(regularFile(required('LHM_CLOUD_TLS_KEY')));
 const host=process.env.LHM_CLOUD_HOST||'127.0.0.1';
 const port=Number(process.env.LHM_CLOUD_PORT||8443);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid HTTPS port');
 const {app}=createCloudService({storageDir:stateDir,
  actors:config.actors,initialMemberships:config.initialMemberships});
 const server=https.createServer({cert:tlsCert,key:tlsKey,minVersion:'TLSv1.2'},app);
 server.listen(port,host,()=>console.log('LHM Cloud HTTPS listening on '+host+':'+port));
 const shutdown=()=>server.close(()=>process.exit(0));
 process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
if(require.main===module)start();
module.exports={start};
