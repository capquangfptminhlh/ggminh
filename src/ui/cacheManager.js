'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-cache-manager');
 const result=el('cache-result'),list=el('cache-profile-list'),summary=el('cache-summary');
 let ids=[],lastPreview=null;
 const selected=()=>window.LHMProfileSelection?.getSelected()||[];
 function formatBytes(bytes){return (bytes/(1024*1024)).toFixed(2)+' MB';}
 async function preview(){
  ids=selected();lastPreview=null;
  if(!ids.length||ids.length>20){
   summary.textContent='Chọn 1–20 hồ sơ trước khi dọn cache.';
   list.replaceChildren();return;
  }
  const data=await window.api.previewProfileCache(ids);
  lastPreview=data;
  summary.textContent='Đã chọn '+data.selected+' profile · ~'+formatBytes(data.estimatedBytes)+
   (data.truncated?' (chỉ tính một phần)':'');
  list.replaceChildren();
  for(const profile of data.entries){
   const row=document.createElement('div');row.className='lhm-cache-row';
   const name=document.createElement('span');name.textContent=profile.name;
   const info=document.createElement('small');
   info.textContent=profile.folders+' thư mục · '+formatBytes(profile.estimatedBytes);
   row.append(name,info);list.append(row);
  }
 }
 async function show(){
  result.textContent='';
  el('cache-confirmation').value='';
  modal.classList.add('open');
  try{await preview();}catch(e){result.textContent='Lỗi xem trước: '+e.message;}
 }
 el('btn-cache-manager').addEventListener('click',show);
 el('selection-cache').addEventListener('click',show);
 for(const id of ['cache-close','cache-cancel'])
  el(id).addEventListener('click',()=>modal.classList.remove('open'));
 el('cache-preview').addEventListener('click',()=>preview().catch(e=>{result.textContent=e.message;}));
 el('cache-clear').addEventListener('click',async()=>{
  if(!lastPreview||lastPreview.selected<1){result.textContent='Hãy xem trước trước khi xóa.';return;}
  if(el('cache-confirmation').value!=='XOA CACHE'){
   result.textContent='Bạn phải nhập chính xác XOA CACHE.';return;
  }
  if(!confirm('Xóa vĩnh viễn cache của '+ids.length+' profile? Không thể hoàn tác.'))return;
  const button=el('cache-clear');button.disabled=true;
  try{
   const data=await window.api.clearProfileCache(ids,'XOA CACHE');
   result.textContent='Đã xóa '+data.foldersCleared+' thư mục cache của '+data.profiles+
    ' profile. Lỗi: '+data.failures+'.';
   el('cache-confirmation').value='';
   await preview();
  }catch(e){result.textContent='Không thể dọn cache: '+e.message;}
  finally{button.disabled=false;}
 });
});