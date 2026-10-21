'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const el=id=>document.getElementById(id);
  const modal=el('modal-window-manager');
  const message=el('wm-result');
  const label=el('wm-selection');
  const listing=el('wm-profile-list');
  const buttonIds=['wm-focus','wm-grid','wm-cascade','wm-open-url','wm-refresh'];
  let active=[],all=[],targetIds=[];
  let syncing=false;
  const selected=()=>window.LHMProfileSelection?.getSelected()||[];
  function render(){
    listing.replaceChildren();
    const byId=new Map(all.map(p=>[p.id,p]));
    const running=new Set(active.map(x=>x.profileId));
    const currentlyRunning=targetIds.filter(id=>running.has(id));
    label.textContent=targetIds.length+' hồ sơ được chọn · '+currentlyRunning.length+
      ' cửa sổ đang chạy · giới hạn 10 hồ sơ cho mỗi lệnh';
    for(const id of targetIds.slice(0,25)){
      const p=byId.get(id);if(!p)continue;
      const row=document.createElement('div');row.className='lhm-wm-row';
      const name=document.createElement('span');name.textContent=p.name;
      const status=document.createElement('small');status.textContent=
        running.has(id)?'Đang mở':'Đã đóng';
      row.append(name,status);listing.append(row);
    }
    el('wm-focus').disabled=currentlyRunning.length!==1||targetIds.length!==1;
    el('wm-grid').disabled=currentlyRunning.length===0||targetIds.length>10;
    el('wm-cascade').disabled=currentlyRunning.length===0||targetIds.length>10;
    el('wm-open-url').disabled=!targetIds.length||targetIds.length>10;
    el('wm-open-live-url').disabled=!currentlyRunning.length||targetIds.length>10;
    const picker=el('wm-sync-master'),value=picker.value;
    picker.replaceChildren();
    for(const id of currentlyRunning){
      const profile=byId.get(id);
      if(profile?.engine!=='chromium')continue;
      const option=document.createElement('option');
      option.value=id;option.textContent=profile.name;
      picker.append(option);
    }
    if([...picker.options].some(x=>x.value===value))picker.value=value;
    el('wm-sync-start').disabled=syncing||picker.options.length<2;
    el('wm-sync-stop').disabled=!syncing;
  }
  async function refresh(){
    const [profiles,live]=await Promise.all([
      window.api.getProfiles(),window.api.getActiveBrowsers()
    ]);
    all=profiles;active=live;
    const selection=selected();
    targetIds=selection.length?selection:live.map(x=>x.profileId);
    render();
    await showSyncStatus();
  }
  async function showSyncStatus(){
    const s=await window.api.getNavigationSyncStatus();
    syncing=s.active;
    el('wm-sync-state').textContent=s.active
      ?'Đang chạy · '+s.events+'/'+s.maxEvents+' lần · '+(s.error||'Chỉ URL HTTPS được phép')
      :'Đã tắt · Không theo dõi click hay nhập liệu';
    el('wm-sync-stop').disabled=!syncing;
    el('wm-sync-start').disabled=syncing||el('wm-sync-master').options.length<2;
  }
  async function perform(mode){
    const button=el('wm-'+mode);
    button.disabled=true;
    message.textContent='Đang yêu cầu Windows quản lý cửa sổ...';
    try{
      const ids=targetIds.filter(id=>active.some(x=>x.profileId===id));
      const result=await window.api.arrangeBrowserWindows(ids,mode);
      message.textContent='Đã sắp xếp '+result.arranged+'/'+result.results.length+
        ' cửa sổ. '+result.results.filter(x=>!x.ok).map(x=>x.message).join('; ');
    }catch(error){message.textContent='Không thành công: '+error.message;}
    finally{render();}
  }
  async function openUrl(){
    const button=el('wm-open-url');
    button.disabled=true;
    message.textContent='Đang mở các hồ sơ chưa chạy...';
    try{
      const result=await window.api.openUrlForStoppedProfiles(targetIds,el('wm-shared-url').value);
      message.textContent='Đã mở '+result.opened+'/'+result.requested+
        ' hồ sơ. Bỏ qua '+result.skipped+' (đang chạy, thiếu hồ sơ hoặc lỗi).';
      await refresh();
      await loadProfiles();
    }catch(error){message.textContent='Không thành công: '+error.message;}
    finally{render();}
  }
  async function openLiveUrl(){
    const button=el('wm-open-live-url');
    button.disabled=true;
    message.textContent='Đang gửi yêu cầu mở tab tới các trình duyệt đang chạy...';
    try{
      const result=await window.api.openUrlInRunningProfiles(targetIds,el('wm-shared-url').value);
      const failures=result.results.filter(x=>x.status!=='opened');
      message.textContent='Đã mở '+result.opened+'/'+result.requested+
        ' tab. Không mở: '+failures.length+
        (failures.length?' · '+failures.map(x=>x.status).join(', '):'');
      await refresh();
    }catch(error){message.textContent='Không thành công: '+error.message;}
    finally{render();}
  }
  async function show(){
    message.textContent='';
    modal.classList.add('open');
    try{await refresh();}catch(error){message.textContent=error.message;}
  }
  el('btn-window-manager').addEventListener('click',show);
  el('selection-windows').addEventListener('click',show);
  for(const name of ['wm-close','wm-done'])
    el(name).addEventListener('click',()=>modal.classList.remove('open'));
  el('wm-refresh').addEventListener('click',()=>refresh().catch(error=>{message.textContent=error.message;}));
  for(const mode of ['focus','grid','cascade'])
    el('wm-'+mode).addEventListener('click',()=>perform(mode));
  el('wm-open-url').addEventListener('click',openUrl);
  el('wm-open-live-url').addEventListener('click',openLiveUrl);
  el('wm-sync-start').addEventListener('click',async()=>{
    const masterId=el('wm-sync-master').value;
    const followerIds=targetIds.filter(id=>id!==masterId&&
      active.some(x=>x.profileId===id)&&all.some(p=>p.id===id&&p.engine==='chromium'));
    try{
      await window.api.startNavigationSync({masterId,followerIds,hosts:el('wm-sync-hosts').value});
      message.textContent='Đã bật đồng bộ điều hướng (chỉ HTTPS, giới hạn 15 lần).';
      await showSyncStatus();
    }catch(error){message.textContent='Lỗi đồng bộ: '+error.message;}
  });
  el('wm-sync-stop').addEventListener('click',async()=>{
    try{await window.api.stopNavigationSync();await showSyncStatus();}
    catch(error){message.textContent='Không dừng được: '+error.message;}
  });
  setInterval(()=>{
    if(modal.classList.contains('open'))
      showSyncStatus().catch(error=>{el('wm-sync-state').textContent=error.message;});
  },3000);
});