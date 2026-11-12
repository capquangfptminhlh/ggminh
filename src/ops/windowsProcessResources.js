'use strict';
const {execFile}=require('node:child_process');

function positivePid(value){
 const pid=Number(value);return Number.isSafeInteger(pid)&&pid>0?pid:null;
}
function nonNegative(value){
 const number=Number(value);return Number.isFinite(number)&&number>=0?number:0;
}
function buildProcessTreeResources(input,rootPids){
 const rows=(Array.isArray(input)?input:[]).map(row=>({
  pid:positivePid(row?.ProcessId),parentPid:positivePid(row?.ParentProcessId),
  workingSetBytes:nonNegative(row?.WorkingSetSize),
  cpuTime100ns:nonNegative(row?.KernelModeTime)+nonNegative(row?.UserModeTime),
  name:typeof row?.Name==='string'?row.Name:''
 })).filter(row=>row.pid);
 const byParent=new Map();
 for(const row of rows){
  const children=byParent.get(row.parentPid)||[];children.push(row);byParent.set(row.parentPid,children);
 }
 const byPid=new Map(rows.map(row=>[row.pid,row]));
 const assigned=new Set();
 const trees=[];
 for(const rootPid of [...new Set((Array.isArray(rootPids)?rootPids:[])
  .map(positivePid).filter(Boolean))]){
  if(assigned.has(rootPid)||!byPid.has(rootPid))continue;
  const queue=[rootPid],seen=new Set(),members=[];
  while(queue.length){
   const pid=queue.shift();
   if(seen.has(pid)||assigned.has(pid))continue;
   seen.add(pid);assigned.add(pid);
   const row=byPid.get(pid);if(row)members.push(row);
   for(const child of byParent.get(pid)||[])if(!seen.has(child.pid))queue.push(child.pid);
  }
  members.sort((a,b)=>a.pid-b.pid);
  trees.push({rootPid,pids:members.map(row=>row.pid),processCount:members.length,
   workingSetBytes:members.reduce((sum,row)=>sum+row.workingSetBytes,0),
   cpuTime100ns:members.reduce((sum,row)=>sum+row.cpuTime100ns,0),
   processes:members.map(row=>({pid:row.pid,parentPid:row.parentPid,name:row.name,
    workingSetBytes:row.workingSetBytes,cpuTime100ns:row.cpuTime100ns}))});
 }
 return {trees,totalWorkingSetBytes:trees.reduce((sum,tree)=>sum+tree.workingSetBytes,0),
  totalProcessCount:trees.reduce((sum,tree)=>sum+tree.processCount,0)};
}
function collectProcessTreeResources(rootPids,{platform=process.platform,exec=execFile}={}){
 if(platform!=='win32')return Promise.resolve({status:'NOT_SUPPORTED',reason:'Windows process resources require CIM'});
 const roots=(Array.isArray(rootPids)?rootPids:[]).map(positivePid).filter(Boolean);
 if(!roots.length)return Promise.resolve({status:'MEASURED',trees:[],
  totalWorkingSetBytes:0,totalProcessCount:0});
 const command='Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime,Name | ConvertTo-Json -Compress';
 return new Promise(resolve=>exec('powershell.exe',
  ['-NoProfile','-NonInteractive','-Command',command],
  {timeout:8000,windowsHide:true,maxBuffer:16*1024*1024,encoding:'utf8'},
  (error,stdout)=>{
   if(error)return resolve({status:'ERROR',reason:String(error.message||error).slice(0,220)});
   try{
    const parsed=JSON.parse(String(stdout||'[]'));
    resolve({status:'MEASURED',...buildProcessTreeResources(
     Array.isArray(parsed)?parsed:[parsed],roots)});
   }catch(parseError){resolve({status:'ERROR',reason:'Invalid CIM process snapshot: '+
    String(parseError.message).slice(0,160)})}
  }));
}

module.exports={buildProcessTreeResources,collectProcessTreeResources};
