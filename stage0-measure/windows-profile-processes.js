'use strict';

const path=require('node:path');
const {spawnSync}=require('node:child_process');

function exactWindowsPathPattern(profileDir){
 const normalized=path.win32.normalize(profileDir).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // Firefox accepts both `-profile "C:\\path"` and `--profile=C:\\path`.
 // Boundaries prevent iso_a from matching a different profile such as
 // iso_a_sibling.
 return new RegExp('(?:^|[\\s"\'=])'+normalized+'(?=$|[\\s"\'])','i');
}

function profilePidsFromWindowsSnapshot(stdout,profileDir){
 if(typeof profileDir!=='string'||!path.win32.isAbsolute(profileDir))
  throw Error('Windows profile directory must be absolute');
 let parsed;
 try{parsed=JSON.parse(String(stdout||'').replace(/^\uFEFF/,''))}
 catch(error){throw Error('Invalid Windows process snapshot: '+String(error.message||error))}
 const rows=Array.isArray(parsed)?parsed:(parsed&&typeof parsed==='object'?[parsed]:[]);
 const exact=exactWindowsPathPattern(profileDir);
 return [...new Set(rows.filter(row=>Number.isSafeInteger(Number(row?.ProcessId))&&
   Number(row.ProcessId)>0&&String(row?.Name||'').toLowerCase()==='camoufox.exe'&&
   typeof row.CommandLine==='string'&&exact.test(row.CommandLine))
  .map(row=>Number(row.ProcessId)))].sort((a,b)=>a-b);
}

function queryWindowsProfilePids(profileDir,{run=spawnSync}={}){
 const command='Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress';
 const result=run('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
  {encoding:'utf8',timeout:15000,windowsHide:true,maxBuffer:16*1024*1024});
 if(result?.error||result?.status!==0){
  const error=Error('Unable to query Windows process command lines: '+
   String(result?.error?.message||result?.stderr||'PowerShell exited '+result?.status).trim().slice(0,180));
  error.code='NOT_RUN';throw error;
 }
 return profilePidsFromWindowsSnapshot(result.stdout,profileDir);
}

module.exports={profilePidsFromWindowsSnapshot,queryWindowsProfilePids};
