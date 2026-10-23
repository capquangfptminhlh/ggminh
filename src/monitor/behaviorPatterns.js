'use strict';
/**
 * Cross-profile behaviour pattern warnings.
 *
 * BehaviorMonitor (v1.2) already warns about single-profile repetition and
 * app-wide open volume inside 10 minutes. This module analyses the same
 * app-level event shape ({action, profileId, source, at}) for patterns
 * BETWEEN profiles that make managed profiles look coordinated:
 * - many profiles opened inside one tight burst window;
 * - two profiles repeating the same action sequence back to back;
 * - bulk open+close cycles across the whole app;
 * - one profile opened at near-constant intervals.
 *
 * Only application actions are analysed — no page content, no credentials,
 * no keystrokes. Warnings are operational review prompts, never a claim
 * that any platform detects or links the profiles.
 */
const ALLOWED=new Set(['profile_open','profile_close','profile_save','profile_delete']);
const SOURCES=new Set(['manual','api']);
const ID=/^[\w-]{1,64}$/;
const MAX_EVENTS=20000;
const BURST_WINDOW_MS=60000;
const SEQUENCE_WINDOW_MS=10*60*1000;
const REGULAR_MIN_OPENS=4;

function isRecord(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}

function normalizeEvents(events){
 if(!Array.isArray(events)||events.length>MAX_EVENTS)
  throw Error('Behaviour events must be a bounded array');
 const out=[];
 for(const e of events){
  if(!isRecord(e)||!ALLOWED.has(e.action)||
     typeof e.profileId!=='string'||!ID.test(e.profileId)||
     !SOURCES.has(e.source)||!Number.isFinite(e.at))
   throw Error('Invalid behaviour event');
  out.push({action:e.action,profileId:e.profileId,source:e.source,at:e.at});
 }
 return out.sort((a,b)=>a.at-b.at);
}

function behaviorPatternWarnings(events){
 const list=normalizeEvents(events);
 const alerts=[];
 const push=({code,level,profiles,count,message,windowFrom,windowTo,values={}})=>
  alerts.push({code,level,profiles,profileId:profiles.length===1?profiles[0]:null,
   count,message,windowFrom,windowTo,latestAt:windowTo,values});

 // Synchronized burst: >=3 distinct profiles opened within 60 seconds.
 const opens=list.filter(e=>e.action==='profile_open');
 for(let i=0;i<opens.length;i++){
  const window=opens.filter(o=>o.at>=opens[i].at&&
   o.at-opens[i].at<=BURST_WINDOW_MS);
  const distinct=new Set(window.map(o=>o.profileId));
  if(distinct.size>=3){
   push({code:'synchronized_open_burst',level:'medium',
    profiles:[...distinct].sort(),count:distinct.size,
    message:'Nhiều hồ sơ được mở gần như đồng thời trong 60 giây. '+
     'Kiểm tra lịch hoặc tác vụ điều phối nếu đây không phải chủ đích vận hành.',
    windowFrom:Math.min(...window.map(o=>o.at)),
    windowTo:Math.max(...window.map(o=>o.at)),
    values:{action:'profile_open',windowMs:BURST_WINDOW_MS}});
   break;
  }
 }

 // Identical action sequences repeated by two different profiles.
 const sequences=new Map();
 for(const e of list){
  if(!sequences.has(e.profileId))sequences.set(e.profileId,[]);
  sequences.get(e.profileId).push(e);
 }
 const triplesOf=(items)=>{
  const found=new Map();
  for(let i=0;i+2<items.length;i++){
   const triple=items.slice(i,i+3);
   if(triple[2].at-triple[0].at>SEQUENCE_WINDOW_MS)continue;
   const key=triple.map(t=>t.action).join('>');
   if(!found.has(key))found.set(key,[]);
   found.get(key).push(triple);
  }
  return found;
 };
 const perProfileTriples=new Map();
 for(const [id,items] of sequences)perProfileTriples.set(id,triplesOf(items));
 const ids=[...perProfileTriples.keys()];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const a=perProfileTriples.get(ids[i]),b=perProfileTriples.get(ids[j]);
  for(const [key,triplesA] of a){
   const triplesB=b.get(key);
   if(!triplesB)continue;
   let pair=null;
   for(const ta of triplesA){
    const tb=triplesB.find(candidate=>
     Math.abs(candidate[2].at-ta[2].at)<=SEQUENCE_WINDOW_MS);
    if(tb){pair=[ta,tb];break;}
   }
   if(pair){
    const relevant=pair.flat();
    push({code:'identical_sequence',level:'medium',profiles:[ids[i],ids[j]].sort(),
     count:2,
     message:'Hai hồ sơ ('+ids[i]+', '+ids[j]+') lặp lại cùng chuỗi thao tác '+
      key.replaceAll('>',' → ')+' trong thời gian gần nhau. Xem lại quy '+
      'trình thao tác được dùng cho hai hồ sơ.',
     windowFrom:Math.min(...relevant.map(e=>e.at)),
     windowTo:Math.max(...relevant.map(e=>e.at)),
     values:{sequence:key.split('>'),windowMs:SEQUENCE_WINDOW_MS}});
    break;
   }
  }
 }

 // Bulk open+close across the app inside any 10-minute window.
 for(let i=0;i<list.length;i++){
  const window=list.filter(e=>e.at>=list[i].at&&
   e.at-list[i].at<=SEQUENCE_WINDOW_MS);
  const o=window.filter(e=>e.action==='profile_open').length;
  const c=window.filter(e=>e.action==='profile_close').length;
  if(o>=8&&c>=8){
   push({code:'bulk_open_close',level:'medium',
    profiles:[...new Set(window.map(e=>e.profileId))].sort(),count:o+c,
    message:'Mở/đóng hồ sơ hàng loạt trong 10 phút trên toàn ứng dụng. '+
     'Kiểm tra tác vụ hàng loạt và nhịp thao tác.',
    windowFrom:Math.min(...window.map(e=>e.at)),
    windowTo:Math.max(...window.map(e=>e.at)),
    values:{opens:o,closes:c,windowMs:SEQUENCE_WINDOW_MS}});
   break;
  }
 }

 // Near-constant intervals are an operational review signal only, not a
 // conclusion about whether a person or automation performed the actions.
 for(const [id] of sequences){
  const times=opens.filter(o=>o.profileId===id).map(o=>o.at);
  if(times.length<REGULAR_MIN_OPENS)continue;
  const gaps=[];
  for(let i=1;i<times.length;i++)gaps.push(times[i]-times[i-1]);
  const mean=gaps.reduce((s,g)=>s+g,0)/gaps.length;
  if(mean<=0)continue;
  const variance=gaps.reduce((s,g)=>s+(g-mean)**2,0)/gaps.length;
  const cv=Math.sqrt(variance)/mean;
  if(cv<0.1)
   push({code:'regular_interval_open',level:'medium',profiles:[id],
    count:times.length,
    message:'Hồ sơ được mở theo khoảng cách thời gian gần như không đổi '+
     '(hệ số biến thiên <0,1). Kiểm tra lịch hoặc tác vụ tự động nếu '+
     'đây không phải chủ đích vận hành.',
    windowFrom:times[0],windowTo:times[times.length-1],
    values:{intervalsMs:gaps,coefficientOfVariation:cv}});
 }

 const levelOrder={high:0,medium:1};
 alerts.sort((a,b)=>levelOrder[a.level]-levelOrder[b.level]||
  b.latestAt-a.latestAt);
 return {
  level:alerts.some(a=>a.level==='high')?'high':alerts.length?'medium':'normal',
  alertCount:alerts.length,
  eventsAnalysed:list.length,
  alerts,
  note:'Cross-profile pattern warnings from app-level actions only; '+
   'not a platform detection verdict.'
 };
}
module.exports={behaviorPatternWarnings,normalizeEvents};
