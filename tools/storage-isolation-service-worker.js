'use strict';
// Self-contained so this exact function can be embedded in the synthetic page.
async function inspectServiceWorker(nav,location,mode,who,{timeoutMs=8000,pollMs=100}={}){
 if(!nav.serviceWorker)return {supported:false,registration:null};
 const sw=nav.serviceWorker;
 if(mode==='set'){
  if(who!=='A'&&who!=='B')throw Error('Invalid synthetic worker owner');
  const reg=await sw.register('/lhm-worker.js?owner='+who,{scope:'/lhm-isolation/'});
  const expected=location.origin+'/lhm-worker.js?owner='+who,until=Date.now()+timeoutMs;
  while((!reg.active||reg.active.scriptURL!==expected||reg.active.state!=='activated')&&Date.now()<until)
   await new Promise(resolve=>setTimeout(resolve,pollMs));
  if(!reg.active||reg.active.scriptURL!==expected||reg.active.state!=='activated')throw Error('Service Worker activation timeout');
 }
 const registrations=await sw.getRegistrations();
 if(!registrations.length)return {supported:true,registration:null};
 if(registrations.length!==1||registrations[0].scope!==location.origin+'/lhm-isolation/'||
    !registrations[0].active||registrations[0].active.state!=='activated')
  return {supported:true,registration:'unexpected'};
 const script=new URL(registrations[0].active.scriptURL);
 const owner=script.searchParams.get('owner');
 if(script.origin!==location.origin||script.pathname!=='/lhm-worker.js'||!['A','B'].includes(owner)||
    [...script.searchParams.keys()].length!==1)return {supported:true,registration:'unexpected'};
 return {supported:true,registration:owner};
}
module.exports={inspectServiceWorker};
