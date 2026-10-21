'use strict';
// Device credentials belong to authenticated workspace members. Store hashes,
// not one-time device secrets; revocation is checked on every sync request.
const crypto=require('crypto');
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const isId=v=>typeof v==='string'&&ID.test(v);
const hash=secret=>crypto.createHash('sha256').update(secret).digest();
function requireDevices(state){
 if(!Array.isArray(state.devices))state.devices=[];
 return state.devices;
}
function issueDevice(state,{tenantId,actorId,subjectId,deviceId,now=Date.now}){
 if(!isId(tenantId)||!isId(subjectId)||!isId(deviceId))
  throw Error('Invalid device identity');
 const actor=(state.memberships||[]).find(x=>x.tenantId===tenantId&&
  x.subjectId===actorId&&x.status==='active'&&['owner','admin'].includes(x.role)&&
  x.groups?.includes('*'));
 const target=(state.memberships||[]).find(x=>x.tenantId===tenantId&&
  x.subjectId===subjectId&&x.status==='active');
 if(!actor||!target||(actor.role!=='owner'&&target.role==='owner'))
  throw Error('Only authorized owners/admins may enroll devices');
 const devices=requireDevices(state);
 if(devices.some(x=>x.tenantId===tenantId&&x.deviceId===deviceId))
  throw Error('Device ID is already used; revoke before re-enrollment');
 if(devices.filter(x=>x.tenantId===tenantId&&x.status==='active').length>=100)
  throw Error('Maximum 100 active devices per workspace');
 const secret=crypto.randomBytes(48).toString('base64url');
 const device={tenantId,subjectId,deviceId,hash:hash(secret).toString('hex'),
  status:'active',createdAt:now(),revokedAt:null};
 devices.push(device);
 state.audit.push({at:now(),tenantId,actorId,event:'team.device.enrolled',
  target:deviceId,subjectId});
 return {deviceId,subjectId,deviceKey:secret}; // Reveal key only once.
}
function verifyDevice(state,{tenantId,subjectId,deviceId,deviceKey}){
 if(!isId(tenantId)||!isId(subjectId)||!isId(deviceId)||
   typeof deviceKey!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(deviceKey))
  return false;
 const device=requireDevices(state).find(x=>x.tenantId===tenantId&&
  x.subjectId===subjectId&&x.deviceId===deviceId&&x.status==='active');
 if(!device||!device.hash||!/^[0-9a-f]{64}$/.test(device.hash))return false;
 return crypto.timingSafeEqual(Buffer.from(device.hash,'hex'),hash(deviceKey));
}
function revokeDevice(state,{tenantId,actorId,deviceId,now=Date.now}){
 const actor=(state.memberships||[]).find(x=>x.tenantId===tenantId&&
  x.subjectId===actorId&&x.status==='active'&&['owner','admin'].includes(x.role)&&
  x.groups?.includes('*'));
 if(!actor||!isId(deviceId))throw Error('Device access denied');
 const d=requireDevices(state).find(x=>x.tenantId===tenantId&&
  x.deviceId===deviceId&&x.status==='active');
 if(!d)throw Error('Device missing or already revoked');
 if(actor.role!=='owner'){
  const target=(state.memberships||[]).find(x=>x.tenantId===tenantId&&
    x.subjectId===d.subjectId);
  if(target?.role==='owner')throw Error('Admin cannot revoke owner device');
 }
 d.status='revoked';d.revokedAt=now();d.hash=null;
 state.audit.push({at:now(),tenantId,actorId,event:'team.device.revoked',target:deviceId});
 return {revoked:true};
}
function listDevices(state,tenantId,actorId){
 const actor=(state.memberships||[]).find(x=>x.tenantId===tenantId&&
  x.subjectId===actorId&&x.status==='active'&&['owner','admin'].includes(x.role)&&
  x.groups?.includes('*'));
 if(!actor)throw Error('Device access denied');
 return requireDevices(state).filter(x=>x.tenantId===tenantId).map(x=>({
  deviceId:x.deviceId,subjectId:x.subjectId,status:x.status,
  createdAt:x.createdAt,revokedAt:x.revokedAt
 }));
}
module.exports={issueDevice,verifyDevice,revokeDevice,listDevices};
