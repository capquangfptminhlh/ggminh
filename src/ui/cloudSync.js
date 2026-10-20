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
  el('cloud-team-result').textContent='';
  el('cloud-team-list').replaceChildren();
  el('cloud-team-email').value='';
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
 const teamResult=el('cloud-team-result');
 const memberList=el('cloud-team-list');
 function credentials(){const {passphrase,...auth}=options();return auth;}
 function drawMembers(items){
  memberList.replaceChildren();
  for(const member of items){
   const row=document.createElement('div');row.className='lhm-wm-row';
   const label=document.createElement('span');
   label.textContent=member.subjectId+' · '+member.role+' · '+
    (Array.isArray(member.groups)?member.groups.join(', '):'');
   row.append(label);
   if(member.status==='active'){
    const revoke=document.createElement('button');revoke.type='button';
    revoke.className='btn btn-sm btn-danger';revoke.textContent='Thu hồi';
    revoke.addEventListener('click',async()=>{
     if(!window.confirm('Thu hồi quyền '+member.subjectId+'?'))return;
     toggleBusy(true);
     try{
      await window.api.cloudTeamRevoke(credentials(),member.subjectId);
      drawMembers(await window.api.cloudTeamMembers(credentials()));
      teamResult.textContent='Đã thu hồi quyền '+member.subjectId+'.';
     }catch(error){teamResult.textContent='Thu hồi thất bại: '+error.message;}
     finally{toggleBusy(false);}
    });
    row.append(revoke);
   }
   memberList.append(row);
  }
  if(!items.length)memberList.textContent='Chưa có thành viên.';
 }
 el('cloud-team-load').addEventListener('click',async()=>{
  toggleBusy(true);
  try{
   const items=await window.api.cloudTeamMembers(credentials());
   drawMembers(items);teamResult.textContent='Đã tải '+items.length+' thành viên.';
  }catch(error){teamResult.textContent='Không thể tải Team: '+error.message;}
  finally{toggleBusy(false);}
 });
 el('cloud-team-invite').addEventListener('click',async()=>{
  const email=el('cloud-team-email').value.trim();
  const role=el('cloud-team-role').value;
  if(!email||!['viewer','operator','admin'].includes(role)){
   teamResult.textContent='Nhập email và quyền hợp lệ.';return;
  }
  if(!window.confirm('Tạo lời mời '+role+' cho '+email+
   '? Thành viên cần token riêng do quản trị viên cấp.'))return;
  toggleBusy(true);
  try{
   const invite=await window.api.cloudTeamInvite(credentials(),{
    email,role,groups:['*'],ttlHours:24
   });
   // One-time invite token is not stored; closing modal erases it from UI.
   teamResult.textContent='Mã lời mời một lần (24 giờ): '+invite.token+
    ' · Gửi riêng qua kênh an toàn.';
  }catch(error){teamResult.textContent='Không tạo được lời mời: '+error.message;}
  finally{toggleBusy(false);}
 });
});
