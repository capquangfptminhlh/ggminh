'use strict';
// Thin lifecycle bridge to the signed native Windows Camoufox executable.
// Manual GUI only; no Playwright, CDP or assumed WebSocket endpoint.
class CamoufoxAdapter{
 constructor(launcher){this.launcher=launcher;}
 async launch(profile,{customUrl}={}){
  const launcher=this.launcher;
  if(!launcher.camoufoxAdapter)
   throw Error('Camoufox adapter is not available; no engine binary bundled');
  // Explicit lab-only controller; failure is never retried via native spawn.
  const controlled=launcher.camoufoxPlaywrightController;
  if(controlled?.enabled===true){
   const {info}=await controlled.launch(profile,{
    url:customUrl||profile.startUrl,
    onClosed:()=>{
     const current=launcher.activeProcesses.get(profile.id);
     if(current?.provider==='camoufox')
      launcher.activeProcesses.delete(profile.id);
    }
   });
   launcher.activeProcesses.set(profile.id,{
    ...info,process:null,stopping:false,engineType:'camoufox'
   });
   return {...info,engineType:'camoufox'};
  }
  const native=launcher.camoufoxAdapter;
  const open=native.launchProfile||native.start;
  if(typeof open!=='function')throw Error('Camoufox launcher exposes no profile start method');
  const details=await open.call(native,profile,{
   url:customUrl||profile.startUrl,
   onClosed:()=>{
    const current=launcher.activeProcesses.get(profile.id);
    if(current?.provider==='camoufox')
     launcher.activeProcesses.delete(profile.id);
   }
  });
  const record={...details,process:null,stopping:false,engineType:'camoufox'};
  launcher.activeProcesses.set(profile.id,record);
  return {...details,engineType:'camoufox'};
 }
}
module.exports=CamoufoxAdapter;