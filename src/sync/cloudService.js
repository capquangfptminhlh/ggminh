'use strict';
// Optional, standalone Cloud Sync REST service. Stores only ciphertext.
// Bootstrap identities are pre-provisioned server-side; do not put token hashes
// or provisioned actor identities in the Electron app or public GitHub repo.
const express=require('express');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const {authorize,activeMember,TeamInvitations}=require('../team/policy');
const {KIND}=require('./encryptedMetadata');

const IDENT=/^[a-zA-Z0-9_-]{1,80}$/;
const MAX_CIPHER=1024*1024;
function invalid(message,status=400){const err=Error(message);err.status=status;return err;}
function isId(value){return typeof value==='string'&&IDENT.test(value);}
function nonEmptyBytes(s,bytes){
 if(typeof s!=='string'||s.length>Math.ceil(bytes*4/3)+6||
    !/^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(s))
  return false;
 const b=Buffer.from(s,'base64');
 return b.length>0&&b.length<=bytes&&b.toString('base64')===s;
}
function verifyEnvelope(e,tenantId,nextRevision){
 if(!e||typeof e!=='object'||Array.isArray(e)||
   Object.keys(e).sort().join(',')!=='ciphertext,deviceId,iv,kind,revision,salt,tag,tenantId'||
   e.kind!==KIND||e.tenantId!==tenantId||!isId(e.deviceId)||
   e.revision!==nextRevision||
   !nonEmptyBytes(e.salt,16)||Buffer.from(e.salt||'','base64').length!==16||
   !nonEmptyBytes(e.iv,12)||Buffer.from(e.iv||'','base64').length!==12||
   !nonEmptyBytes(e.tag,16)||Buffer.from(e.tag||'','base64').length!==16||
   !nonEmptyBytes(e.ciphertext,MAX_CIPHER))
  throw invalid('Invalid encrypted envelope');
 return true;
}
function validateActor(actor){
 if(!actor||!isId(actor.subjectId)||
  typeof actor.verifiedEmail!=='string'||actor.verifiedEmail.length>254||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor.verifiedEmail)||
  typeof actor.tokenHash!=='string'||!/^[0-9a-f]{64}$/.test(actor.tokenHash))
  throw Error('Each actor requires a subject ID, verified email and SHA-256 token hash');
 return {subjectId:actor.subjectId,verifiedEmail:actor.verifiedEmail.toLowerCase(),
  tokenHash:actor.tokenHash};
}
function prepareState(initialMemberships){
 if(!Array.isArray(initialMemberships)||!initialMemberships.length)
  throw Error('Provision at least one server-side owner membership');
 const ids=new Set();
 const memberships=initialMemberships.map(m=>{
  if(!isId(m.tenantId)||!isId(m.subjectId)||
   !['owner','admin','operator','viewer'].includes(m.role)||
   !Array.isArray(m.groups)||!m.groups.length||
   !m.groups.every(g=>g==='*'||isId(g))||m.status!=='active')
   throw Error('Invalid bootstrap membership');
  const key=m.tenantId+':'+m.subjectId;
  if(ids.has(key))throw Error('Duplicate membership');
  ids.add(key);
  return {tenantId:m.tenantId,subjectId:m.subjectId,role:m.role,
   groups:[...m.groups],status:'active'};
 });
 if(!memberships.some(m=>m.role==='owner'&&m.groups.includes('*')))
  throw Error('An owner with all group scopes is required');
 return {schema:1,memberships,invites:[],audit:[],sync:{}};
}
function createCloudService({storageDir,actors,initialMemberships,now=()=>Date.now()}={}){
 if(typeof storageDir!=='string'||!storageDir)throw Error('Missing storageDir');
 if(!Array.isArray(actors)||!actors.length||actors.length>10000)
  throw Error('Provide server-side actor credentials');
 const trusted=actors.map(validateActor);
 if(new Set(trusted.map(a=>a.tokenHash)).size!==trusted.length||
    new Set(trusted.map(a=>a.subjectId)).size!==trusted.length)
  throw Error('Duplicate actor identities');
 fs.mkdirSync(storageDir,{recursive:true,mode:0o700});
 const filename=path.join(storageDir,'cloud-state.json');
 if(fs.existsSync(filename)&&!fs.lstatSync(filename).isFile())
  throw Error('Cloud state must be a regular file');
 let state=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):
   prepareState(initialMemberships);
 if(state.schema!==1||!Array.isArray(state.memberships)||!Array.isArray(state.invites)||
   !Array.isArray(state.audit)||!state.sync||typeof state.sync!=='object')
  throw Error('Invalid persisted cloud state');
 function persist(next){
  const scratch=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{
   fs.writeFileSync(scratch,JSON.stringify(next),{flag:'wx',mode:0o600});
   fs.renameSync(scratch,filename);
   state=next;
  }finally{try{fs.rmSync(scratch,{force:true});}catch(_){}}
 }
 if(!fs.existsSync(filename))persist(state);
 const app=express();
 app.disable('x-powered-by');
 app.use(express.json({limit:'1500kb',strict:true}));
 app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin)return res.status(403).json({error:'Browser origins denied'});
  next();
 });
 app.get('/health',(_req,res)=>res.json({status:'ok',service:'LHM Cloud API',version:1}));
 app.use((req,res,next)=>{
  const value=req.get('authorization')||'';
  const match=/^Bearer ([a-zA-Z0-9_-]{40,256})$/.exec(value);
  if(!match)return res.status(401).json({error:'Unauthorized'});
  const digest=crypto.createHash('sha256').update(match[1]).digest();
  let actor=null;
  for(const identity of trusted){
   const hash=Buffer.from(identity.tokenHash,'hex');
   if(crypto.timingSafeEqual(hash,digest))actor=identity;
  }
  if(!actor)return res.status(401).json({error:'Unauthorized'});
  req.actor=actor;next();
 });
 function guard(action,{tenantId,groupId}={},actor){
  return isId(tenantId)&&authorize(state,{tenantId,subjectId:actor.subjectId,
   action,...(groupId?{groupId}:{})});
 }
 app.get('/v1/workspaces/:tenantId/sync',(req,res)=>{
  const {tenantId}=req.params;
  if(!guard('sync:read',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  const item=state.sync[tenantId];
  return res.json({revision:item?.revision||0,envelope:item?.envelope||null});
 });
 app.put('/v1/workspaces/:tenantId/sync',(req,res)=>{
  const {tenantId}=req.params;
  if(!guard('sync:write',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  try{
   const expectedRevision=req.body?.expectedRevision;
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    throw invalid('Expected revision must be a non-negative integer');
   const previous=state.sync[tenantId]?.revision||0;
   if(previous!==expectedRevision)return res.status(409).json({
    error:'Revision conflict',revision:previous});
   verifyEnvelope(req.body?.envelope,tenantId,previous+1);
   // No await between version comparison and atomic persistence: single process CAS.
   const next=structuredClone(state);
   next.sync[tenantId]={revision:previous+1,envelope:req.body.envelope};
   next.audit.push({at:now(),tenantId,actorId:req.actor.subjectId,
    event:'sync.metadata.updated',revision:previous+1});
   next.audit=next.audit.slice(-1000);
   persist(next);
   return res.status(201).json({revision:previous+1});
  }catch(error){return res.status(error.status||500).json({error:
   error.status?error.message:'Unable to persist encrypted metadata'});}
 });
 app.get('/v1/workspaces/:tenantId/members',(req,res)=>{
  const {tenantId}=req.params;
  if(!guard('team:manage',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  const members=state.memberships.filter(x=>x.tenantId===tenantId).map(x=>({
   subjectId:x.subjectId,role:x.role,groups:x.groups,status:x.status
  }));
  res.json({members});
 });
 app.post('/v1/workspaces/:tenantId/invites',(req,res)=>{
  const {tenantId}=req.params;
  if(!guard('team:invite',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  try{
   const next=structuredClone(state);
   const invitation=new TeamInvitations(next,{now}).issue({
    tenantId,issuedBy:req.actor.subjectId,email:req.body?.email,
    role:req.body?.role,groups:req.body?.groups,ttlHours:req.body?.ttlHours});
   next.audit=next.audit.slice(-1000);
   persist(next);
   // Return the token exactly once, never store the token itself or log it.
   return res.status(201).json(invitation);
  }catch(error){return res.status(400).json({error:error.message});}
 });
 app.post('/v1/workspaces/:tenantId/invites/redeem',(req,res)=>{
  const {tenantId}=req.params;
  if(!isId(tenantId))return res.status(400).json({error:'Invalid workspace'});
  try{
   const next=structuredClone(state);
   const membership=new TeamInvitations(next,{now}).accept({
    tenantId,token:req.body?.token,subjectId:req.actor.subjectId,
    verifiedEmail:req.actor.verifiedEmail});
   next.audit=next.audit.slice(-1000);
   persist(next);
   return res.status(201).json(membership);
  }catch(error){return res.status(400).json({error:error.message});}
 });
 app.post('/v1/workspaces/:tenantId/invites/:inviteId/revoke',(req,res)=>{
  const {tenantId,inviteId}=req.params;
  if(!guard('team:manage',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  try{
   const next=structuredClone(state);
   new TeamInvitations(next,{now}).revoke({tenantId,
    issuedBy:req.actor.subjectId,id:inviteId});
   persist(next);
   return res.json({revoked:true});
  }catch(error){return res.status(400).json({error:error.message});}
 });
 app.delete('/v1/workspaces/:tenantId/members/:subjectId',(req,res)=>{
  const {tenantId,subjectId}=req.params,actor=req.actor;
  if(!guard('team:manage',{tenantId},actor))return res.status(403).json({error:'Forbidden'});
  const caller=activeMember(state,tenantId,actor.subjectId);
  const target=activeMember(state,tenantId,subjectId);
  if(!target||subjectId===actor.subjectId||
     (caller.role!=='owner'&&['owner','admin'].includes(target.role)))
   return res.status(403).json({error:'Forbidden'});
  const next=structuredClone(state);
  const member=next.memberships.find(x=>x.tenantId===tenantId&&x.subjectId===subjectId);
  member.status='revoked';
  next.audit.push({at:now(),tenantId,actorId:actor.subjectId,
   event:'team.member.revoked',target:subjectId});
  next.audit=next.audit.slice(-1000);
  persist(next);
  res.json({revoked:true});
 });
 app.get('/v1/workspaces/:tenantId/audit',(req,res)=>{
  const {tenantId}=req.params;
  if(!guard('audit:read',{tenantId},req.actor))return res.status(403).json({error:'Forbidden'});
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  res.json({events:state.audit.filter(a=>a.tenantId===tenantId).slice(-limit)});
 });
 app.use((error,_req,res,_next)=>{
  res.status(error.status===413?413:400).json({error:'Invalid request'});
 });
 return {app,readState:()=>structuredClone(state)};
}
module.exports={createCloudService,verifyEnvelope,prepareState};
