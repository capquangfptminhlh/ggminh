'use strict';
// Consent-based, navigation-only sync between locally running Chromium profiles.
// Deliberately excludes clicks, text input, cookies, password and form data.
const {prepare,openInRunning}=require('./liveNavigation');
function allowedHosts(input){
 if(typeof input!=='string')throw Error('Enter 1–5 allowed HTTPS DNS hosts');
 const names=input.toLowerCase().split(/[\s,;]+/).filter(Boolean);
 if(!names.length||names.length>5||new Set(names).size!==names.length)
  throw Error('Enter 1–5 unique HTTPS DNS hosts');
 for(const host of names){
  if(host.length>253||host==='localhost'||host.endsWith('.localhost')||
     /^\d+\.\d+\.\d+\.\d+$/.test(host)||
     !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host))
   throw Error('IP, wildcard, localhost or invalid hostname is not permitted');
 }
 return new Set(names);
}
function safeUrl(raw,hosts){
 try{
  if(typeof raw!=='string'||raw.length>2048)return null;
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     !hosts.has(url.hostname.toLowerCase()))return null;
  url.search='';url.hash=''; // Never replicate query-string secrets.
  return url.toString();
 }catch(_){return null;}
}
class NavigationSynchronizer{
 constructor(store,launcher,{fetcher=globalThis.fetch,opener=openInRunning,intervalMs=2000}={}){
  this.store=store;this.launcher=launcher;this.fetcher=fetcher;this.opener=opener;
  this.intervalMs=Math.max(1500,Number(intervalMs)||2000);
  this.session=null;this.timer=null;this.busy=false;this.epoch=0;
 }
 status(){
  const s=this.session;
  return s?{active:true,masterId:s.masterId,followerIds:s.followers,
   events:s.events,maxEvents:15,error:s.error,lastUrl:s.lastUrl,startedAt:s.startedAt}:
   {active:false,events:0,maxEvents:15};
 }
 start({masterId,followerIds,hosts}={}){
  if(this.session)throw Error('Stop synchronizer before starting a new session');
  if(typeof masterId!=='string'||!Array.isArray(followerIds)||
     !followerIds.length||followerIds.length>9||new Set(followerIds).size!==followerIds.length||
     followerIds.includes(masterId))throw Error('Select distinct master and 1–9 followers');
  const permitted=allowedHosts(hosts);
  const list=[masterId,...followerIds];
  const ready=prepare(this.store,this.launcher,list,'https://example.com/');
  if(ready.running.length!==list.length||ready.skipped.length)
   throw Error('All selected profiles must be active Chromium with Local API enabled');
  const port=ready.running.find(x=>x.id===masterId).port;
  this.epoch++;
  this.session={masterId,followers:[...followerIds],hosts:permitted,port,tab:null,
   lastUrl:null,events:0,error:null,startedAt:new Date().toISOString()};
  this.timer=setInterval(()=>this.poll().catch(()=>{}),this.intervalMs);
  this.timer.unref?.();
  return this.status();
 }
 stop(){
  this.epoch++;
  if(this.timer)clearInterval(this.timer);
  this.timer=null;this.session=null;return this.status();
 }
 async poll(){
  if(!this.session||this.busy)return this.status();
  const s=this.session,epoch=this.epoch;
  if(this.launcher.getActive?.(s.masterId)?.port!==s.port){
   this.stop();return this.status();
  }
  this.busy=true;
  try{
   const r=await this.fetcher('http://127.0.0.1:'+s.port+'/json',{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(2500)});
   if(!r.ok)throw Error('Local DevTools target query failed');
   const targets=await r.json();
   if(!Array.isArray(targets)||targets.length>100)throw Error('Invalid targets');
   if(epoch!==this.epoch)return this.status();
   const tab=s.tab?
     targets.find(t=>t?.type==='page'&&t.id===s.tab):
     targets.find(t=>t?.type==='page'&&safeUrl(t.url,s.hosts));
   if(!tab){
    if(s.tab)this.stop();else s.error='No matching master HTTPS tab';
    return this.status();
   }
   const url=safeUrl(tab.url,s.hosts);
   if(!s.tab){s.tab=tab.id;s.lastUrl=url;s.error=null;return this.status();}
   if(!url||url===s.lastUrl)return this.status();
   const ready=prepare(this.store,this.launcher,s.followers,url);
   if(ready.skipped.length||ready.running.length!==s.followers.length){
    this.stop();return this.status();
   }
   if(epoch!==this.epoch)return this.status();
   s.lastUrl=url;
   const result=await this.opener(this.store,this.launcher,s.followers,url);
   if(epoch!==this.epoch)return this.status();
   s.events++;
   s.error=result.opened===s.followers.length?null:'Some followers could not open new tabs';
   if(s.events>=15)this.stop();
   return this.status();
  }catch(err){
   if(this.epoch===epoch&&this.session===s)s.error=String(err.message).slice(0,180);
   return this.status();
  }finally{this.busy=false;}
 }
}
module.exports={NavigationSynchronizer,allowedHosts,safeUrl};
