'use strict';
// Manual Cloud metadata sync UI. Does not persist bearer tokens or passphrases.
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id);
 const trigger=el('btn-cloud-sync'),modal=el('modal-cloud-sync');
 if(!trigger||!modal)return;
 const result=el('cloud-sync-result');
 let previewRevision=null,busy=false;
 function options(){
  return {baseUrl:el('cloud-sync-url').value.trim(),
   tenantId:el('cloud-sync-tenant').value.trim(),
   deviceId:el('cloud-sync-device').value.trim(),
   token:el('cloud-sync-token').value,
   passphrase:el('cloud-sync-passphrase').value};
 }
 function resetPreview(){previewRevision=null;el('cloud-sync-apply').disabled=true;}
 function toggleBusy(value){
  busy=value;
  for(const id of ['cloud-sync-preview','cloud-sync-push'])
   el(id).disabled=value;
  el('cloud-sync-apply').disabled=value||previewRevision===null;
 }
 function close(){
  if(busy)return;
  modal.classList.remove('open');
  el('cloud-sync-token').value='';
  el('cloud-sync-passphrase').value='';
  el('cloud-sync-confirm').value='';
  resetPreview();
 }
 trigger.addEventListener('click',()=>{
  modal.classList.add('open');
  result.textContent='Chỉ thao tác thủ công với máy chủ HTTPS do bạn cấp quyền.';
  resetPreview();
 });
 el('cloud-sync-close').addEventListener('click',close);
 el('cloud-sync-done').addEventListener('click',close);
 for(const id of ['cloud-sync-url','cloud-sync-tenant','cloud-sync-device',
  'cloud-sync-token','cloud-sync-passphrase']){
  el(id).addEventListener('input',resetPreview);
 }
 el('cloud-sync-preview').addEventListener('click',async()=>{
  toggleBusy(true);resetPreview();
  result.textContent='Đang tải metadata đã mã hóa và giải mã cục bộ...';
  try{
   const res=await window.api.cloudSyncPreview(options());
   previewRevision=res.empty?null:res.revision;
   const names=res.profiles.slice(0,12).map(p=>p.name).join(', ');
   result.textContent='Cloud revision '+res.revision+' · '+res.profiles.length+
     ' hồ sơ (chỉ metadata). '+(names?'Xem trước: '+names:'Chưa có dữ liệu.');
  }catch(error){result.textContent='Không thể xem Cloud: '+error.message;}
  finally{toggleBusy(false);}
 });
 el('cloud-sync-push').addEventListener('click',async()=>{
  if(!window.confirm('Đẩy metadata đã mã hóa từ máy này lên Workspace? Phiên bản Cloud sẽ được thay thế. Không chuyển cookie, mật khẩu hay phiên đăng nhập.'))return;
  toggleBusy(true);resetPreview();
  result.textContent='Đang mã hóa và gửi metadata (không có dữ liệu phiên)...';
  try{
   const saved=await window.api.cloudSyncPush(options());
   result.textContent='Đã cập nhật Cloud revision '+saved.revision+
     ' · '+saved.profileCount+' hồ sơ. Máy chủ chỉ nhận ciphertext.';
  }catch(error){result.textContent='Không thể đẩy Cloud: '+error.message;}
  finally{toggleBusy(false);}
 });
 el('cloud-sync-apply').addEventListener('click',async()=>{
  if(previewRevision===null||el('cloud-sync-confirm').value!=='APPLY CLOUD'){
   result.textContent='Cần xem bản Cloud trước và nhập chính xác APPLY CLOUD.';
   return;
  }
  if(!window.confirm('Áp dụng metadata Cloud lên hồ sơ đã đóng của máy này? Profile mới sẽ không có phiên đăng nhập.'))return;
  const expectedRevision=previewRevision;
  toggleBusy(true);
  result.textContent='Đang kiểm tra phiên bản Cloud và nhập metadata...';
  try{
   const applied=await window.api.cloudSyncApply({
    ...options(),expectedRevision,confirmation:el('cloud-sync-confirm').value
   });
   result.textContent='Đã nhập metadata revision '+applied.revision+
    ': tạo '+applied.created+', cập nhật '+applied.updated+' hồ sơ.';
   resetPreview();
   if(typeof loadProfiles==='function')await loadProfiles();
  }catch(error){result.textContent='Không thể áp dụng: '+error.message;}
  finally{toggleBusy(false);}
 });
});
