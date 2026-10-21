'use strict';
// Team authorization primitives. This is a backend policy library, NOT a login system.
// subjectId and verifiedEmail MUST originate from a trusted authenticated session.
const crypto=require('crypto');
const PERMISSIONS=Object.freeze({
 owner:['profile:read','profile:write','profile:launch','profile:delete',
  'team:invite','team:manage','audit:read','sync:read','sync:write'],
 admin:['profile:read','profile:write','profile:launch','profile:delete',
  'team:invite','team:manage','audit:read','sync:read','sync:write'],
 operator:['profile:read','profile:write','profile:launch','sync:read','sync:write'],
 viewer:['profile:read','sync:read']
});
const ROLE_LEVEL={owner:4,admin:3,operator:2,viewer:1};
const VALID_ID=/^[a-zA-Z0-9_-]{1,80}$/;
function validId(v){return typeof v==='string'&&VALID_ID.test(v);}
function activeMember(state,tenantId,subjectId){
 if(!validId(tenantId)||!validId(subjectId))return null;
 return (state.memberships||[]).find(m=>m.tenantId===tenantId&&
  m.subjectId===subjectId&&m.status==='active'&&
  Object.prototype.hasOwnProperty.call(PERMISSIONS,m.role))||null;
}
function scopes(member,groupId){
 if(!groupId)return false; // Do not grant unscoped resource operations.
 return Array.isArray(member.groups)&&
  (member.groups.includes('*')||member.groups.includes(groupId));
}
function authorize(state,{tenantId,subjectId,action,profileId,groupId}={}){
 const member=activeMember(state,tenantId,subjectId);
 if(!member||!PERMISSIONS[member.role].includes(action))return false;
 if(action.startsWith('team:')||action==='audit:read')
  return member.groups?.includes('*')===true;
 if(profileId!==undefined){
  if(!validId(profileId))return false;
  const profile=(state.profiles||[]).find(p=>p.tenantId===tenantId&&
   p.id===profileId);
  if(!profile)return false;
  return scopes(member,profile.groupId);
 }
 if(action.startsWith('profile:'))return false; // Never authorize a profile action without a known resource.
 if(action.startsWith('sync:'))return member.groups?.includes('*')===true||
  (validId(groupId)&&scopes(member,groupId));
 return false;
}
function requirePermission(state,query){
 if(!authorize(state,query))throw Error('Access denied');
 return true;
}
const digest=token=>crypto.createHash('sha256').update(token,'utf8').digest();
function normalizeEmail(email){
 if(typeof email!=='string')throw Error('Invalid invite email');
 const s=email.trim().toLowerCase();
 if(s.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Invalid invite email');
 return s;
}
class TeamInvitations{
 constructor(state,{randomBytes=crypto.randomBytes,now=()=>Date.now()}={}){
  if(!state||!Array.isArray(state.memberships))throw Error('Team state must include memberships');
  this.state=state;this.randomBytes=randomBytes;this.now=now;
  if(!Array.isArray(state.invites))state.invites=[];
  if(!Array.isArray(state.audit))state.audit=[];
 }
 issue({tenantId,issuedBy,email,role,groups,ttlHours=24}){
  requirePermission(this.state,{tenantId,subjectId:issuedBy,action:'team:invite'});
  const issuer=activeMember(this.state,tenantId,issuedBy);
  if(!['admin','operator','viewer'].includes(role)||
     (issuer.role==='admin'&&role==='admin'))
   throw Error('Cannot invite this role');
  if(!Array.isArray(groups)||!groups.length||groups.length>30||
     new Set(groups).size!==groups.length||
     groups.some(g=>g!=='*'&&!validId(g)))throw Error('Invalid group scopes');
  if(!groups.every(g=>issuer.groups.includes('*')||issuer.groups.includes(g)))
   throw Error('Cannot invite beyond your own group scope');
  if(groups.includes('*')&&issuer.groups.includes('*')!==true)
   throw Error('Cannot grant global group scope');
  if(!Number.isInteger(ttlHours)||ttlHours<1||ttlHours>168)
   throw Error('Invite expiry must be 1–168 hours');
  const normalized=normalizeEmail(email);
  const token=this.randomBytes(32).toString('base64url');
  const record={
   id:'inv_'+crypto.randomUUID(),tenantId,email:normalized,role,groups:[...groups],
   digest:digest(token).toString('hex'),issuedBy,
   expiresAt:this.now()+ttlHours*3600*1000,usedAt:null,revokedAt:null
  };
  this.state.invites.push(record);
  this.state.audit.push({at:this.now(),tenantId,actorId:issuedBy,
   event:'team.invite.issued',target:record.id,role});
  return {token,id:record.id,expiresAt:record.expiresAt};
 }
 accept({tenantId,token,subjectId,verifiedEmail}){
  if(!validId(tenantId)||!validId(subjectId)||typeof token!=='string'||
     token.length<40||token.length>100)throw Error('Invalid invitation');
  const received=digest(token);
  const record=this.state.invites.find(x=>{
   if(x.tenantId!==tenantId||typeof x.digest!=='string'||!/^[0-9a-f]{64}$/.test(x.digest))
    return false;
   return crypto.timingSafeEqual(Buffer.from(x.digest,'hex'),received);
  });
  if(!record||record.revokedAt||record.usedAt||record.expiresAt<=this.now())
   throw Error('Invitation missing, revoked, used or expired');
  if(normalizeEmail(verifiedEmail)!==record.email)
   throw Error('Invitation identity mismatch');
  if(activeMember(this.state,tenantId,subjectId))
   throw Error('Member already exists');
  // Do not accept if issuer was revoked or no longer has the original grant.
  const issuer=activeMember(this.state,tenantId,record.issuedBy);
  if(!issuer||!authorize(this.state,{tenantId,subjectId:record.issuedBy,
      action:'team:invite'})||
      !record.groups.every(g=>issuer.groups.includes('*')||issuer.groups.includes(g))||
      ROLE_LEVEL[issuer.role]<=ROLE_LEVEL[record.role])
   throw Error('Invitation issuer permission was revoked');
  this.state.memberships.push({tenantId,subjectId,role:record.role,
   groups:[...record.groups],status:'active'});
  record.usedAt=this.now();
  this.state.audit.push({at:this.now(),tenantId,actorId:subjectId,
   event:'team.invite.accepted',target:record.id});
  return {tenantId,subjectId,role:record.role,groups:[...record.groups]};
 }
 revoke({tenantId,issuedBy,id}){
  requirePermission(this.state,{tenantId,subjectId:issuedBy,action:'team:manage'});
  const record=this.state.invites.find(x=>x.id===id&&x.tenantId===tenantId);
  if(!record||record.usedAt)throw Error('Invitation not revocable');
  record.revokedAt=this.now();
  this.state.audit.push({at:this.now(),tenantId,actorId:issuedBy,
   event:'team.invite.revoked',target:id});
  return true;
 }
}
module.exports={PERMISSIONS,authorize,requirePermission,activeMember,TeamInvitations};
