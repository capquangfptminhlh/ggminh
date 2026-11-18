'use strict';
const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const readline=require('node:readline'),crypto=require('node:crypto'),path=require('node:path');
const managed=new WeakSet();
function isJobSupervisor(proc){return managed.has(proc)}
function spawnJobSupervisor(executable,args,options={}){
 if(process.platform!=='win32'||!path.isAbsolute(executable)||!Array.isArray(args)||
    args.some(value=>typeof value!=='string'))throw Error('Invalid supervised browser launch');
 const startupTimeoutMs=options.startupTimeoutMs??30000;
 if(!Number.isInteger(startupTimeoutMs)||startupTimeoutMs<100||startupTimeoutMs>60000)
  throw Error('Invalid supervisor startup timeout');
 const proc=new EventEmitter();managed.add(proc);
 proc.pid=undefined;proc.exitCode=null;proc.signalCode=null;proc.jobComplete=false;proc.dialogBlocked=false;
 proc.windowState='unobserved';proc.windowStateCounts={unknown:0,dialog:0,clear:0};
 proc.closeSummary=null;
 // Used only as a job-scoped fallback when the normal window close fails.
 proc.kill=signal=>proc.requestJobStop(signal==='SIGKILL');
 proc.resume=()=>{
  if(state!=='suspended')throw Error('Browser job cannot be resumed');
  state='resuming';
  const result=new Promise((resolve,reject)=>{resolveResume=resolve;rejectResume=reject});
  startupTimer=setTimeout(()=>fail('Browser job supervisor timed out while resuming'),startupTimeoutMs);
  helper.stdin.write('RESUME\n');return result;
 };
 proc.abortStart=()=>{if(state==='suspended')helper.stdin.end()};
 proc.requestJobStop=(force=false)=>{
  if(!['running','draining'].includes(state)||helper.stdin.destroyed||!helper.stdin.writable)return false;
  try{helper.stdin.write(force?'FORCE\n':'STOP\n');return true}catch(_){return false}
 };
 const helperDir=__dirname.split(path.sep).includes('app.asar')
  ?path.resolve(__dirname,'..','..','..','app.asar.unpacked','src','engine')
  :__dirname;
 const script=path.join(helperDir,'windowsJobSupervisor.ps1');
 const bridge=path.join(helperDir,'jobSupervisorBridge.js');
 const helper=(options.supervisorSpawner||spawn)(process.execPath,[bridge,script],{
  windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],
  env:{...(options.env||process.env),ELECTRON_RUN_AS_NODE:'1'}
 });
 const token=options.jobEvidence?.token||crypto.randomBytes(24).toString('hex');
 const job=options.jobEvidence?.jobName||('Local\\LhmJob-'+token);
 let state='starting',rootCode=null,failed=false,resolveResume=null,rejectResume=null;
 let startupTimer=setTimeout(()=>fail('Browser job supervisor timed out'),startupTimeoutMs);
 function fail(message){
  if(failed||proc.jobComplete)return;
  failed=true;state='failed';clearTimeout(startupTimer);
  try{helper.kill()}catch(_){}
  const error=Error(message);if(rejectResume)rejectResume(error);
  proc.emit('error',error);proc.emit('exit',null);
 }
 helper.stderr.resume();
 helper.on('error',()=>fail('Browser job supervisor failed'));
 helper.stdin.on('error',()=>fail('Browser job supervisor input failed'));
 const lines=readline.createInterface({input:helper.stdout,crlfDelay:Infinity});
 lines.on('line',line=>{
  try{
   if(line.length>4096)throw Error();
   const msg=JSON.parse(line);
   if(state==='starting'&&msg.event==='creating')return;
   if((state==='starting'||state==='suspended')&&msg.event==='aborted'){
    clearTimeout(startupTimer);proc.jobComplete=true;proc.startAborted=true;state='complete';
    proc.emit('error',Error('Browser job supervisor aborted before the browser could run'));
    proc.emit('exit',null);return;
   }
   if(state==='starting'&&msg.event==='started'&&Number.isSafeInteger(msg.pid)&&msg.pid>0){
    clearTimeout(startupTimer);proc.pid=msg.pid;state='suspended';proc.emit('spawn');return;
   }
   if(state==='resuming'&&msg.event==='resumed'){
    clearTimeout(startupTimer);state='running';resolveResume();resolveResume=null;rejectResume=null;return;
   }
   if(state==='running'&&msg.event==='root-exited'&&Number.isInteger(msg.code)&&msg.code>=0){
    rootCode=msg.code;proc.pid=undefined;state='draining';return;
   }
   if((state==='running'||state==='draining')&&msg.event==='window-state'&&
      ['unknown','dialog','clear'].includes(msg.state)){
    proc.windowState=msg.state;proc.windowStateCounts[msg.state]++;return;
   }
   if((state==='running'||state==='draining')&&msg.event==='close-summary'&&
      ['attempts','sent','notSent','errors'].every(key=>Number.isSafeInteger(msg[key])&&msg[key]>=0&&msg[key]<=1000000)&&
      msg.attempts===msg.sent+msg.notSent+msg.errors&&typeof msg.forced==='boolean'){
    proc.closeSummary={attempts:msg.attempts,sent:msg.sent,notSent:msg.notSent,errors:msg.errors,forced:msg.forced};return;
   }
   if((state==='running'||state==='draining')&&(msg.event==='dialog-blocked'||msg.event==='dialog-cleared')){
    proc.dialogBlocked=msg.event==='dialog-blocked';
    if(!proc.dialogBlocked)proc.emit('stop-cancelled');
    return;
   }
   if(state==='draining'&&msg.event==='empty'){
    proc.jobComplete=true;proc.exitCode=rootCode;state='complete';proc.emit('exit',rootCode);return;
   }
   throw Error();
  }catch(_){fail('Browser job supervisor returned invalid state')}
 });
 helper.on('close',()=>{if(!proc.jobComplete)fail('Browser job supervisor ended before job completion')});
 helper.stdin.write(JSON.stringify({job,executable,args,evidence:options.jobEvidence||null,
  stopGraceMs:options.stopGraceMs||10000})+'\n');
 return proc;
}
module.exports={spawnJobSupervisor,isJobSupervisor};
