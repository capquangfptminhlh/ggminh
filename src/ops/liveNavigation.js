'use strict';
const {safeWebUrl}=require('../engine/launchArgs');
const {uniqueIds}=require('./operations');
function prepare(store,launcher,ids,url){
 const chosen=uniqueIds(ids);
 if(chosen.length>10)throw Error('Select up to 10 profiles');
 const link=safeWebUrl(url);
 if(store.getSettings().apiEnabled!==true)
  throw Error('Enable Local API before opening Chromium profiles');
 const profileIds=new Map(store.getProfiles().map(p=>[p.id,p]));
 const running=[],skipped=[],seen=new Set();
 for(const id of chosen){
  const profile=profileIds.get(id);
  if(!profile){skipped.push({id,status:'missing'});continue;}
  if(profile.engine==='gecko'){skipped.push({id,status:'gecko_unsupported'});continue;}
  const active=launcher.getActive?.(id);
  if(!active||active.stopping){skipped.push({id,status:'stopped'});continue;}
  const port=Number(active.port);
  if(!Number.isInteger(port)||port<1024||port>65535){
   skipped.push({id,status:'debug_port_unavailable'});continue;
  }
  if(seen.has(port))throw Error('Duplicate active browser debug ports');
  seen.add(port);running.push({id,port});
 }
 if(!running.length)throw Error('No running Chromium profiles with active debug ports');
 return {chosen,link,running,skipped};
}
async function openInRunning(store,launcher,ids,url,{fetcher=fetch}={}){
 const {chosen,link,running,skipped}=prepare(store,launcher,ids,url);
 const results=[...skipped];
 let index=0;
 async function worker(){
  while(index<running.length){
   const {id,port}=running[index++];
   if(launcher.getActive?.(id)?.port!==port){results.push({id,status:'stopped'});continue;}
   const endpoint='http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(link);
   try{
    const response=await fetcher(endpoint,{method:'PUT',redirect:'error',
     signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('Chrome DevTools HTTP '+response.status);
    const target=await response.json();
    if(target?.type!=='page'||typeof target.id!=='string')
     throw Error('DevTools did not confirm new tab');
    results.push({id,status:'opened'});
   }catch(e){results.push({id,status:'error',message:String(e.message).slice(0,180)});}
  }
 }
 await Promise.all([worker(),worker()]);
 const order=new Map(chosen.map((id,i)=>[id,i]));
 results.sort((a,b)=>order.get(a.id)-order.get(b.id));
 return {opened:results.filter(x=>x.status==='opened').length,
  requested:chosen.length,url:link,results};
}
module.exports={prepare,openInRunning};
