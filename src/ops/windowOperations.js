'use strict';
const path=require('path');
const {execFile}=require('child_process');
const {safeWebUrl}=require('../engine/launchArgs');
const {uniqueIds}=require('./operations');

const LIMIT=10;
function selected(ids){
  const checked=uniqueIds(ids);
  if(checked.length>LIMIT)throw Error('Chọn tối đa 10 hồ sơ mỗi lần');
  return checked;
}
function liveTargets(launcher,ids,mode){
  if(!['focus','grid','cascade'].includes(mode))throw Error('Invalid window arrangement');
  const chosen=selected(ids);
  if(mode==='focus'&&chosen.length!==1)throw Error('Chọn đúng 1 hồ sơ để đưa ra trước');
  const targets=[],skipped=[];
  const usedPids=new Set();
  for(const id of chosen){
    const item=launcher.getActive?.(id);
    if(!item || item.stopping || !Number.isSafeInteger(item.pid) || item.pid<1){
      skipped.push({id,reason:'not_running'});
      continue;
    }
    if(usedPids.has(item.pid))throw Error('Two profiles point to the same browser PID');
    usedPids.add(item.pid);
    targets.push({id,pid:item.pid});
  }
  if(!targets.length)throw Error('Không có cửa sổ trình duyệt đang chạy trong lựa chọn');
  return {targets,skipped};
}
function execWindows(file,args,options){
  return new Promise((resolve,reject)=>{
    execFile(file,args,options,(error,stdout,stderr)=>{
      if(error)reject(new Error('Windows window manager: '+String(stderr||error.message).slice(0,300)));
      else resolve(stdout);
    });
  });
}
async function arrangeWindows(launcher,ids,mode,{
  platform=process.platform,execute=execWindows
}={}){
  if(platform!=='win32')throw Error('Quản lý vị trí cửa sổ chỉ hỗ trợ Windows');
  const {targets,skipped}=liveTargets(launcher,ids,mode);
  const script=path.join(__dirname,'windowControl.ps1');
  const stdout=await execute('powershell.exe',[
    '-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass',
    '-File',script,'-Mode',mode,'-Pids',targets.map(x=>x.pid).join(',')
  ],{windowsHide:true,timeout:20000,maxBuffer:96*1024,shell:false});
  let response;
  try{response=JSON.parse(stdout);}
  catch(_){throw Error('Windows did not return a valid window-management result');}
  if(!Array.isArray(response.results))throw Error('Invalid Windows window response');
  const map=new Map(targets.map(x=>[x.pid,x.id]));
  const seen=new Set();
  const results=[];
  for(const item of response.results){
    if(!map.has(item.pid)||seen.has(item.pid)||typeof item.ok!=='boolean')
      throw Error('Windows returned an unexpected process');
    seen.add(item.pid);
    results.push({id:map.get(item.pid),ok:item.ok,message:String(item.message||'').slice(0,120)});
  }
  if(seen.size!==targets.length)throw Error('Windows returned incomplete window results');
  return {mode,arranged:results.filter(x=>x.ok).length,results,skipped};
}
async function openUrlForStoppedProfiles(store,launcher,ids,url,monitor){
  const chosen=selected(ids);
  const link=safeWebUrl(url);
  const profiles=new Map(store.getProfiles().map(x=>[x.id,x]));
  const results=[];
  // Deliberately do not inject URLs into already running sessions.
  // Start only stopped profiles, at most 2 launches in parallel.
  let cursor=0;
  async function worker(){
    while(cursor<chosen.length){
      const id=chosen[cursor++];
      if(!profiles.has(id)){results.push({id,status:'missing'});continue;}
      if(launcher.isBusy(id)){results.push({id,status:'already_running'});continue;}
      try {
        await launcher.start(id,link);
        results.push({id,status:'opened'});
        monitor?.record('profile_open',id,'manual');
      }catch(error){results.push({id,status:'error',message:String(error.message).slice(0,150)});}
    }
  }
  await Promise.all([worker(),worker()]);
  const index=new Map(chosen.map((id,i)=>[id,i]));
  results.sort((a,b)=>index.get(a.id)-index.get(b.id));
  return {
    url:link,requested:chosen.length,
    opened:results.filter(x=>x.status==='opened').length,
    skipped:results.filter(x=>x.status!=='opened').length,
    results
  };
}
module.exports={arrangeWindows,liveTargets,openUrlForStoppedProfiles};
