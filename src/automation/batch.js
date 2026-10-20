'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {uniqueIds}=require('../ops/operations');
const {clean}=require('./studio');

const LIMIT=20;
const HISTORY=60;
function check(store,workflows,runner,workflowId,ids,onError){
 if(onError!=='stop'&&onError!=='continue')throw Error('Select stop or continue on error');
 const flow=workflows.get(workflowId);
 if(!flow)throw Error('Workflow not found');
 // Revalidate saved workflow, not just renderer-supplied metadata.
 clean({...flow,id:undefined},flow);
 const selected=uniqueIds(ids);
 if(selected.length>LIMIT)throw Error('Chọn tối đa 20 hồ sơ');
 const profiles=new Map(store.getProfiles().map(p=>[p.id,p]));
 const targets=selected.map(id=>{
  const p=profiles.get(id);
  if(!p)throw Error('Profile missing: '+id);
  if(p.engine==='gecko')throw Error('RPA queue supports Chromium only');
  if(p.id===null)throw Error('Invalid profile ID');
  return {id,name:p.name.slice(0,160)};
 });
 if(runner.task||runner.batchOwner)throw Error('Automation Studio đang bận');
 return {flow,targets,onError};
}
class BatchAutomation{
 constructor(root,workflows,store,runner,{now=()=>Date.now()}={}){
  this.file=path.join(root,'automation-batches.json');
  this.workflows=workflows;this.store=store;this.runner=runner;this.now=now;
  this.current=null;this.cancel=false;
  let saved=[];
  if(fs.existsSync(this.file)){
   const st=fs.statSync(this.file);
   if(st.size>1024*1024)throw Error('Batch audit log is too large');
   saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
   if(!Array.isArray(saved))throw Error('Invalid batch audit log');
  }
  this.history=saved.slice(0,HISTORY);
  let interrupted=false;
  for(const batch of this.history){
   if(batch.status==='running'||batch.status==='stopping'){
    batch.status='interrupted';batch.finishedAt=new Date(this.now()).toISOString();
    for(const task of batch.tasks||[])if(task.status==='running'||task.status==='pending')
      task.status='interrupted';
    interrupted=true;
   }
  }
  if(interrupted)this.persist();
 }
 persist(){
  const temp=this.file+'.'+process.pid+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';
  try{
   fs.mkdirSync(path.dirname(this.file),{recursive:true});
   fs.writeFileSync(temp,JSON.stringify(this.history,null,2),{mode:0o600,flag:'wx'});
   fs.renameSync(temp,this.file);
  }catch(error){try{fs.rmSync(temp,{force:true});}catch(_){}throw error;}
 }
 preview(id,ids,onError='stop'){
  const data=check(this.store,this.workflows,this.runner,id,ids,onError);
  return {
   workflowId:id,workflowName:data.flow.name,
   profiles:data.targets.map(x=>({...x})),onError,
   steps:data.flow.steps.length,
   needsApproval:data.flow.steps.some(x=>x.type==='approval'),
   note:'One Chromium sandbox runs at a time; approvals must be accepted per profile. No cookies or active browser sessions are copied.'
  };
 }
 start(id,ids,onError='stop'){
  if(this.current)throw Error('Đã có hàng đợi RPA đang chạy');
  const checked=check(this.store,this.workflows,this.runner,id,ids,onError);
  const record={
   id:'batch_'+crypto.randomBytes(8).toString('hex'),workflowId:id,
   workflowName:checked.flow.name,
   startedAt:new Date(this.now()).toISOString(),finishedAt:null,status:'running',
   onError,tasks:checked.targets.map(x=>({profileId:x.id,status:'pending'}))
  };
  const old=this.history;
  this.history=[record,...old].slice(0,HISTORY);
  try{this.persist();}
  catch(error){this.history=old;throw error;}
  this.current=record;this.cancel=false;this.runner.batchOwner=this;
  // Detached from IPC only while the Electron app is running; no background
  // operating-system service. Completion is persisted after each profile.
  this.job=this.execute(record).catch(error=>{
   record.status='failed';record.message=String(error.message).slice(0,180);
  }).finally(()=>{
   record.finishedAt=new Date(this.now()).toISOString();
   if(this.current===record)this.current=null;
   if(this.runner.batchOwner===this)this.runner.batchOwner=null;
   try{this.persist();}catch(error){
    console.warn('[BatchAutomation] Failed to persist final audit:',error.message);
   }
  });
  return this.status();
 }
 async execute(batch){
  for(const item of batch.tasks){
   if(this.cancel){if(item.status==='pending')item.status='skipped';continue;}
   const target=this.store.getProfile(item.profileId);
   if(!target||target.engine==='gecko'){
    item.status='failed';item.message='Profile unavailable';
    this.persist();
    if(batch.onError==='stop'){batch.status='failed';break;}
    continue;
   }
   item.status='running';item.startedAt=new Date(this.now()).toISOString();
   this.persist();
   try{
    this.runner.run(batch.workflowId,{profileId:item.profileId,owner:this});
    await this.runner.completion;
    const state=this.runner.status();
    item.status=state.status==='completed'?'completed':
      state.status==='stopped'?'stopped':'failed';
    // Persist only categorical outcomes. Runner error strings can contain user
    // CSS selectors, page titles or workflow input values.
    if(item.status!=='completed')item.message='Xem lỗi chi tiết trong nhật ký Studio (không lưu vào lịch sử hàng đợi)';
   }catch(error){
    item.status=this.cancel?'stopped':'failed';
    item.message='Không thể khởi chạy quy trình trên hồ sơ này';
   }
   item.finishedAt=new Date(this.now()).toISOString();
   this.persist();
   if(item.status!=='completed'&&batch.onError==='stop')break;
  }
  for(const item of batch.tasks)if(item.status==='pending')item.status='skipped';
  if(this.cancel)batch.status='stopped';
  else batch.status=batch.tasks.some(x=>x.status==='failed'||x.status==='stopped')?'failed':'completed';
  this.persist();
 }
 status(){
  const record=this.current||this.history[0]||null;
  return {active:!!this.current,batch:record?structuredClone(record):null,
   recent:this.history.slice(0,10).map(x=>({
    id:x.id,workflowName:x.workflowName,status:x.status,
    startedAt:x.startedAt,finishedAt:x.finishedAt,
    total:x.tasks.length,
    passed:x.tasks.filter(t=>t.status==='completed').length
   }))};
 }
 stop(){
  if(!this.current)return {stopped:false};
  this.cancel=true;
  this.current.status='stopping';
  this.runner.stop();
  return {stopped:true};
 }
}
module.exports={BatchAutomation,check};
