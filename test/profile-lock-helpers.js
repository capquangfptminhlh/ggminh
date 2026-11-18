'use strict';
// Synthetic browser processes in unit tests are not visible to the OS.
const profileLockOptions={localStorage:async()=>true,browserInstancesExist:async()=>false};
async function waitForUnlock(launcher,id){
 for(let i=0;i<100&&launcher.isBusy(id);i++)await new Promise(resolve=>setTimeout(resolve,10));
 if(launcher.isBusy(id))throw Error('Synthetic profile lock did not release');
}
module.exports={profileLockOptions,waitForUnlock};
