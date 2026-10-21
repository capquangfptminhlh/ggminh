'use strict';
// Thin lifecycle bridge to the supported Camoufox TypeScript persistent
// BrowserContext launcher in ../camoufoxAdapter.js. No guessed Firefox flags.
class CamoufoxAdapter{
 constructor(launcher){this.launcher=launcher;}
 async launch(profile,{customUrl}={}){
  const launcher=this.launcher;
  if(!launcher.camoufoxAdapter)
   throw Error('Camoufox adapter is not available; no engine binary bundled');
  const details=await launcher.camoufoxAdapter.start(profile,{
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