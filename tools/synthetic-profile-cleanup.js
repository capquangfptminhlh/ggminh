'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {queryWindowsProfilePids}=require('../stage0-measure/windows-profile-processes');

async function removePlaywrightFixture(root,{attempts=40,delayMs=500,
 query=queryWindowsProfilePids,remove=target=>fs.rmSync(target,{recursive:true,force:true}),
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!Number.isInteger(attempts)||attempts<1||!Number.isInteger(delayMs)||delayMs<0)
  throw Error('Invalid synthetic cleanup options');
 const stat=fs.lstatSync(root),resolved=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());
 const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
 if(!stat.isDirectory()||stat.isSymbolicLink()||
    !normalize(resolved).startsWith(normalize(temp+path.sep))||
    !path.basename(resolved).startsWith('lhm-camoufox-playwright-'))
  throw Error('Unsafe synthetic profile cleanup path');
 // The launch arguments may retain Windows' 8.3 spelling even when realpath
 // expands it. Check both spellings before removing the canonical directory.
 const profileRoots=[...new Set([path.resolve(root),resolved])];
 const profiles=profileRoots.flatMap(base=>['A','B','bad-proxy'].map(name=>path.join(base,name)));
 const transient=new Set(['ENOTEMPTY','EBUSY','EPERM']);
 let emptySnapshots=0,lastError=null;
 for(let attempt=0;attempt<attempts;attempt++){
  // Query only these exact synthetic profile paths; never terminate a PID.
  const active=profiles.flatMap(profile=>query(profile));
  emptySnapshots=active.length?0:emptySnapshots+1;
  if(emptySnapshots>=2){
   try{remove(resolved);return;}
   catch(error){if(!transient.has(error.code))throw error;lastError=error;emptySnapshots=1;}
  }
  if(attempt+1<attempts)await sleep(delayMs);
 }
 if(lastError)throw Error('Synthetic profile cleanup remains blocked: '+lastError.message,{cause:lastError});
 throw Error('Synthetic profile processes still running or exit not confirmed');
}
module.exports={removePlaywrightFixture};
