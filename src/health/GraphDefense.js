'use strict';
/**
 * Agency operations safety checks, not a predictor of ad-platform linking.
 * Inputs are explicitly supplied by an authorized operator. Nothing is
 * collected from browser traffic, user behavior, or third-party accounts.
 */
const net=require('net');
const crypto=require('crypto');
const ID=/^[a-zA-Z0-9_-]{1,64}$/;
function profileId(value){
 if(typeof value!=='string'||!ID.test(value))throw Error('Invalid profile ID');
 return value;
}
function parseTime(v){
 const ms=typeof v==='number'?v:typeof v==='string'?Date.parse(v):NaN;
 if(!Number.isSafeInteger(ms)||ms<0||ms>8640000000000000)
  throw Error('Invalid UTC time');
 return ms;
}
function interval(input){
 if(!input||typeof input!=='object')throw Error('Invalid session range');
 const start=parseTime(input.startTime??input.start_time);
 const end=input.endTime===null||input.end_time===null||input.endTime===undefined&&input.end_time===undefined?
  Infinity:parseTime(input.endTime??input.end_time);
 if(end<=start)throw Error('Session end must be after start');
 return {start,end};
}
class GraphDefense{
 static getSubnet24(ipAddress){
  if(typeof ipAddress!=='string'||net.isIP(ipAddress)!==4)
   throw Error('Only canonical IPv4 addresses supported; never reinterpret IPv6');
  const octets=ipAddress.split('.').map(Number);
  return octets.slice(0,3).join('.')+'.0/24';
 }
 static normalizeSubnet(value){
  if(typeof value!=='string')throw Error('Invalid subnet');
  const [ip,prefix]=value.split('/');
  if(prefix!==undefined&&prefix!=='24')throw Error('Expected IPv4 /24');
  return GraphDefense.getSubnet24(ip);
 }
 static checkSubnetRisk(newSubnet,existingSubnets,options={}){
  const subnet=GraphDefense.normalizeSubnet(newSubnet);
  if(!Array.isArray(existingSubnets)||existingSubnets.length>10000)
   throw Error('Invalid subnet list');
  const owner=options.profileId===undefined?null:profileId(options.profileId);
  const seen=new Set();
  for(const item of existingSubnets){
   const raw=typeof item==='string'?item:item?.subnet??item?.ipSubnet24;
   if(raw===undefined)throw Error('Invalid subnet entry');
   if(GraphDefense.normalizeSubnet(raw)!==subnet)continue;
   const id=typeof item==='string'?null:profileId(item.profileId);
   if(owner&&id===owner)continue;
   // Unknown owners count as one shared source, not multiple profiles.
   seen.add(id||'unknown');
  }
  const matches=seen.size;
  return {isRisk:matches>=2,subnet,otherProfiles:matches,
   message:matches>=2?
    'Multiple other managed profiles use this IPv4 /24. Review network capacity, ownership and proxy routing.':
    'No notable /24 concentration among supplied managed profiles.',
   note:'Common /24 networks do not establish common account ownership or platform detection.'};
 }
 static checkTemporalRisk(newTimeRange,existingNetworkLogs){
  const subnet=GraphDefense.normalizeSubnet(newTimeRange?.subnet??newTimeRange?.ipSubnet24);
  const target=interval(newTimeRange);
  const owner=profileId(newTimeRange.profileId);
  if(!Array.isArray(existingNetworkLogs)||existingNetworkLogs.length>20000)
   throw Error('Invalid network activity list');
  const overlaps=new Set();
  for(const item of existingNetworkLogs){
   if(GraphDefense.normalizeSubnet(item?.subnet??item?.ipSubnet24)!==subnet)continue;
   const id=profileId(item.profileId);
   if(id===owner)continue;
   const range=interval(item);
   if(target.start<range.end&&range.start<target.end)
    overlaps.add(id);
  }
  return {isRisk:overlaps.size>0,overlappingProfiles:overlaps.size,
   message:overlaps.size?
    'Another managed profile on this /24 has overlapping scheduled usage; review resource contention.':
    'No overlapping scheduled usage among supplied managed profiles.',
   note:'This is a scheduling/conflict report, not a way to avoid account-linking.'};
 }
 static checkPaymentRisk(cardBin,existingPayments){
  // A six-digit BIN describes an issuer/product range, not an individual
  // funding instrument. Never treat a matching BIN as proof of shared payer.
  if(typeof cardBin!=='string'||!/^[0-9]{6,8}$/.test(cardBin))
   throw Error('BIN must be a 6- or 8-digit issuer identifier');
  if(!Array.isArray(existingPayments)||existingPayments.length>10000)
   throw Error('Invalid payment list');
  const similar=existingPayments.filter(p=>{
   const candidate=typeof p==='string'?p:p?.cardBin;
   return candidate===cardBin;
  }).length;
  return {isRisk:false,similarIssuerRanges:similar,
   message:'BIN identifies an issuer range, not a unique card or account. Do not infer shared payment ownership.',
   note:'Never store PAN, CVV, expiry or raw card details in browser profile records.'};
 }
 static paymentReferenceDigest(providerReference,key){
  if(typeof providerReference!=='string'||!/^[a-z][a-z0-9_-]{1,24}:[-_a-zA-Z0-9]{8,128}$/.test(providerReference))
   throw Error('Use a payment-provider-issued opaque reference, not a card number');
  if(!Buffer.isBuffer(key)||key.length<32)
   throw Error('Use an application secret of at least 32 bytes');
  return crypto.createHmac('sha256',key).update('lhm-billing-ref-v1\n').update(providerReference).digest('hex');
 }
 static checkPaymentReferenceReuse(referenceDigest,known){
  if(typeof referenceDigest!=='string'||!/^[a-f0-9]{64}$/.test(referenceDigest))
   throw Error('Invalid payment reference digest');
  if(!Array.isArray(known)||known.length>10000)throw Error('Invalid payment-reference list');
  const same=known.filter(x=>x===referenceDigest).length;
  return {requiresReview:same>0,matches:same,
   message:same?'Identical provider reference already used internally; confirm authorized billing sharing.':
    'No duplicate provider reference among supplied internal records.',
   note:'Compare only opaque provider references where billing authorization permits.'};
 }
}
module.exports={GraphDefense,interval};
