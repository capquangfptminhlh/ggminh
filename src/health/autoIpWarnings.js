'use strict';
/**
 * Automatic IP warnings from the app's OWN exit-IP observations.
 *
 * GraphDefense answers operator questions about manually entered IPs. This
 * module consumes observations the application itself recorded (one entry
 * per exit-IP check: which profile, which public IPv4, when, which app
 * session) and turns them into warnings:
 * - the same exit IPv4 used by several profiles;
 * - several profiles concentrated on one IPv4 /24 (via GraphDefense);
 * - overlapping usage of profiles on the same /24 (via GraphDefense);
 * - a profile's exit IP changing inside one app session (possible proxy
 *   drop or route change worth reviewing).
 *
 * It never claims a platform can or cannot link profiles: a shared exit IP
 * is an operational fact to review, not a detection verdict. IPv4 only,
 * matching GraphDefense; malformed input fails closed.
 */
const net=require('net');
const {GraphDefense}=require('./GraphDefense');

const ID=/^[a-zA-Z0-9_-]{1,64}$/;
const MAX_OBSERVATIONS=20000;

function isRecord(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}

function normalizeObservations(observations){
 if(!Array.isArray(observations)||!observations.length||
    observations.length>MAX_OBSERVATIONS)
  throw Error('Exit-IP observations must be a non-empty bounded array');
 const out=[];
 for(const item of observations){
  if(!isRecord(item))throw Error('Invalid exit-IP observation');
  if(typeof item.profileId!=='string'||!ID.test(item.profileId))
   throw Error('Invalid profile ID in exit-IP observation');
  if(typeof item.ip!=='string'||net.isIP(item.ip)!==4)
   throw Error('Only canonical IPv4 exit addresses are supported');
  const at=typeof item.observedAt==='number'?item.observedAt:
   typeof item.observedAt==='string'?Date.parse(item.observedAt):NaN;
  if(!Number.isSafeInteger(at)||at<0)throw Error('Invalid observation time');
  if(item.sessionId!==undefined&&
     (typeof item.sessionId!=='string'||!ID.test(item.sessionId)))
   throw Error('Invalid session ID in exit-IP observation');
  out.push({profileId:item.profileId,ip:item.ip,observedAt:at,
   sessionId:item.sessionId||null});
 }
 return out.sort((a,b)=>a.observedAt-b.observedAt);
}

function automaticIpWarnings(observations){
 const obs=normalizeObservations(observations);
 const warnings=[];
 const push=(level,code,profiles,message)=>warnings.push({
  level,code,profiles,message,
  note:'Operational warning from the app\'s own exit-IP observations; '+
   'it does not establish that any platform links these profiles.'});

 // Same exit IPv4 shared by distinct profiles.
 const byIp=new Map();
 for(const o of obs){
  if(!byIp.has(o.ip))byIp.set(o.ip,new Set());
  byIp.get(o.ip).add(o.profileId);
 }
 for(const [ip,profiles] of byIp){
  if(profiles.size>=2)
   push('high','shared_exit_ip',[...profiles].sort(),
    'Exit IP '+ip+' was observed for '+profiles.size+
    ' different profiles. Review proxy assignment before running them.');
 }

 // /24 concentration, judged by GraphDefense on each profile's latest IP.
 const latestByProfile=new Map();
 for(const o of obs)latestByProfile.set(o.profileId,o);
 const entries=[...latestByProfile.values()].map(o=>({
  profileId:o.profileId,subnet:GraphDefense.getSubnet24(o.ip)}));
 for(const entry of entries){
  const risk=GraphDefense.checkSubnetRisk(entry.subnet,entries,
   {profileId:entry.profileId});
  if(risk.isRisk)
   push('medium','subnet_concentration',[entry.profileId],
    'Profile '+entry.profileId+' sits on '+risk.subnet+
    ', which '+risk.otherProfiles+
    ' other managed profiles also use (by latest observation).');
 }

 // Overlapping usage on the same /24, via GraphDefense temporal check on
 // intervals derived from first/last observation per profile+subnet.
 const intervals=new Map();
 for(const o of obs){
  const subnet=GraphDefense.getSubnet24(o.ip);
  const key=o.profileId+'|'+subnet;
  const cur=intervals.get(key);
  if(!cur)intervals.set(key,{profileId:o.profileId,subnet,
   startTime:o.observedAt,endTime:o.observedAt+1});
  else cur.endTime=Math.max(cur.endTime,o.observedAt+1);
 }
 const intervalList=[...intervals.values()];
 for(const target of intervalList){
  const risk=GraphDefense.checkTemporalRisk(target,intervalList);
  if(risk.isRisk)
   push('medium','subnet_overlap',[target.profileId],
    'Profile '+target.profileId+' has usage overlapping another profile '+
    'on '+target.subnet+' (by observation times).');
 }

 // Exit IP changed inside one app session of one profile.
 const bySession=new Map();
 for(const o of obs){
  if(!o.sessionId)continue;
  const key=o.profileId+'|'+o.sessionId;
  if(!bySession.has(key))bySession.set(key,new Set());
  bySession.get(key).add(o.ip);
 }
 for(const [key,ips] of bySession){
  if(ips.size>=2)
   push('high','ip_changed_mid_session',[key.split('|')[0]],
    'Exit IP changed during one app session ('+[...ips].join(', ')+
    '). The proxy route may have dropped or switched mid-session.');
 }

 // One profile seen on many different exit IPs (unstable egress).
 const byProfile=new Map();
 for(const o of obs){
  if(!byProfile.has(o.profileId))byProfile.set(o.profileId,new Set());
  byProfile.get(o.profileId).add(o.ip);
 }
 for(const [profileId,ips] of byProfile){
  if(ips.size>=4)
   push('medium','egress_unstable',[profileId],
    'Profile '+profileId+' was observed on '+ips.size+
    ' different exit IPs. Review proxy stability for this profile.');
 }

 const seen=new Set();
 const deduped=warnings.filter(w=>{
  const key=w.code+'|'+w.profiles.join(',');
  if(seen.has(key))return false;seen.add(key);return true;
 });
 return {
  status:deduped.some(w=>w.level==='high')?'high':
   deduped.length?'medium':'normal',
  warningCount:deduped.length,
  observations:obs.length,
  profilesObserved:latestByProfile.size,
  warnings:deduped,
  note:'Warnings describe the app\'s own network observations only.'
 };
}
module.exports={automaticIpWarnings,normalizeObservations};
