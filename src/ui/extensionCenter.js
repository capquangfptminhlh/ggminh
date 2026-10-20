'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-extension-center');
 const status=el('ext-status'),list=el('ext-list');
 const node=(tag,cls,label)=>{
  const item=document.createElement(tag);if(cls)item.className=cls;
  if(label!==undefined)item.textContent=String(label);return item;
 };
 async function refresh(){
  const [extensions,profiles,active]=await Promise.all([
   window.api.listInstalledExtensions(),window.api.getProfiles(),window.api.getActiveBrowsers()
  ]);
  const ids=window.LHMProfileSelection?.getSelected()||[];
  const chosen=profiles.filter(x=>ids.includes(x.id));
  const activeIds=new Set(active.map(x=>x.profileId));
  const blocked=chosen.some(p=>p.engine!=='chromium'||activeIds.has(p.id));
  el('ext-selection').textContent='Đã chọn '+chosen.length+' profile. '+
   (blocked?'Có hồ sơ đang chạy hoặc Firefox. Hãy đóng/bỏ chọn trước khi gán.':
    'Có thể gán cho các hồ sơ Chromium đã đóng.');
  list.replaceChildren();
  if(!extensions.length)list.append(node('p','','Chưa cài extension nào.'));
  for(const ext of extensions){
   const row=node('div','lhm-extension-row');
   row.append(node('strong','',ext.name+' · v'+ext.version));
   row.append(node('p','',ext.description||'Tiện ích đã nhập từ máy'));
   row.append(node('small','',ext.profileIds.length+' hồ sơ đã gán'));
   row.append(node('p','lhm-extension-permissions',
    'Quyền manifest: '+((ext.permissions||[]).join(', ')||'Không khai báo')));
   const actions=node('div','lhm-extension-actions');
   for(const [label,enabled] of [['Bật cho đã chọn',true],['Tắt cho đã chọn',false]]){
    const button=node('button',enabled?'btn btn-sm btn-primary':'btn btn-sm btn-secondary',label);
    button.type='button';button.disabled=blocked||!chosen.length||chosen.length>50;
    button.addEventListener('click',async()=>{
     if(!confirm(label+' ('+chosen.length+' hồ sơ)?'))return;
     try{
      const result=await window.api.assignExtensionProfiles(ext.id,chosen.map(p=>p.id),enabled);
      status.textContent='Đã cập nhật '+result.updated+' hồ sơ.';
      await refresh();
     }catch(error){status.textContent=error.message;}
    });actions.append(button);
   }
   const remove=node('button','btn btn-sm btn-danger','Gỡ cài đặt');
   remove.type='button';
   remove.addEventListener('click',async()=>{
    if(!confirm('Gỡ extension '+ext.name+' khỏi thiết bị? Hãy đóng các profile đang dùng.'))return;
    try{await window.api.removeInstalledExtension(ext.id);await refresh();}
    catch(error){status.textContent=error.message;}
   });
   actions.append(remove);row.append(actions);list.append(row);
  }
 }
 el('btn-extension-center').addEventListener('click',async()=>{
  modal.classList.add('open');status.textContent='';
  try{await refresh();}catch(e){status.textContent=e.message;}
 });
 for(const id of ['ext-close','ext-done'])
  el(id).addEventListener('click',()=>modal.classList.remove('open'));
 el('ext-refresh').addEventListener('click',()=>refresh().catch(e=>{status.textContent=e.message;}));
 el('ext-install').addEventListener('click',async()=>{
  if(!confirm('Chỉ cài extension tin cậy. Extension có thể đọc nội dung trang web. Tiếp tục?'))return;
  try{
   const answer=await window.api.installExtensionFromFolder();
   if(answer.canceled)return;
   status.textContent='Đã nhập '+answer.extension.name+'. Chọn profile đang đóng để bật.';
   await refresh();
  }catch(e){status.textContent='Nhập extension thất bại: '+e.message;}
 });
});