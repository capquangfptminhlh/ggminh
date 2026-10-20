'use strict';
window.addEventListener('DOMContentLoaded',()=>{
  const modal=document.getElementById('modal-bulk-tags');
  const open=document.getElementById('selection-tags');
  const save=document.getElementById('bulk-tags-save');
  const message=document.getElementById('bulk-tags-status');
  const mode=document.getElementById('bulk-tags-mode');
  const tags=document.getElementById('bulk-tags-input');
  const selected=()=>window.LHMProfileSelection?.getSelected()||[];
  const close=()=>modal.classList.remove('open');
  open.addEventListener('click',()=>{
    const ids=selected();
    if(!ids.length)return;
    if(ids.length>50){alert('Chọn tối đa 50 hồ sơ mỗi lần');return;}
    document.getElementById('bulk-tags-count').textContent=
      'Đang chọn '+ids.length+' hồ sơ; thay đổi sẽ ghi một lần vào bộ nhớ cục bộ.';
    message.textContent='';
    modal.classList.add('open');tags.focus();
  });
  for(const id of ['bulk-tags-cancel','bulk-tags-close'])
    document.getElementById(id).addEventListener('click',close);
  save.addEventListener('click',async()=>{
    const ids=selected();
    const labels=tags.value.split(',').map(x=>x.trim()).filter(Boolean);
    if(!ids.length || ids.length>50){message.textContent='Chọn 1–50 hồ sơ';return;}
    if(mode.value==='replace' && labels.length===0 &&
       !confirm('Xóa tất cả tag của '+ids.length+' hồ sơ?'))return;
    save.disabled=true;
    try{
      const result=await window.api.controlTowerAssignTags(ids,labels,mode.value);
      message.textContent='Đã cập nhật '+result.updated+' hồ sơ.';
      close();
      window.LHMProfileSelection?.clear();
      await loadProfiles();
      await refreshBehaviorAlerts();
    }catch(error){message.textContent='Không thể cập nhật: '+error.message;}
    finally{save.disabled=false;}
  });
});