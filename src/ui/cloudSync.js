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
   deviceKey:el('cloud-sync-device-key').value,
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
  el('cloud-sync-device-key').value='';
  el('cloud-sync-passphrase').value='';
  el('cloud-sync-confirm').value='';
  resetPreview();
  el('cloud-team-result').textContent='';
  el('cloud-team-list').replaceChildren();
  el('cloud-team-email').value='';
  el('cloud-team-invite-token').value='';
  el('cloud-team-device-result').textContent='';
  el('cloud-team-devices').replaceChildren();
  el('cloud-team-device-subject').value='';
  el('cloud-team-device-id').value='';
  el('cloud-sync-history-confirm').value='';
  el('cloud-sync-history-revision').replaceChildren();
  el('cloud-sync-history-restore').disabled=true;
 }
 trigger.addEventListener('click',()=>{
  modal.classList.add('open');
  result.textContent='Chỉ thao tác thủ công với máy chủ HTTPS do bạn cấp quyền.';
  resetPreview();
 });
 el('cloud-sync-close').addEventListener('click',close);
 el('cloud-sync-done').addEventListener('click',close);
 for(const id of ['cloud-sync-url','cloud-sync-tenant','cloud-sync-device',
  'cloud-sync-token','cloud-sync-device-key','cloud-sync-passphrase']){
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
 el('cloud-team-redeem').addEventListener('click',async()=>{
  const token=el('cloud-team-invite-token').value;
  if(!token){teamResult.textContent='Nhập mã lời mời.';return;}
  toggleBusy(true);
  try{
   const accepted=await window.api.cloudTeamRedeem(credentials(),token);
   teamResult.textContent='Đã tham gia Workspace '+accepted.tenantId+
    ' với vai trò '+accepted.role+'.';
   el('cloud-team-invite-token').value='';
  }catch(error){teamResult.textContent='Không nhận được lời mời: '+error.message;}
  finally{toggleBusy(false);}
 });
 const historySelect=el('cloud-sync-history-revision');
 el('cloud-sync-history').addEventListener('click',async()=>{
  toggleBusy(true);
  try{
   const versions=await window.api.cloudSyncHistory(options());
   historySelect.replaceChildren();
   for(const item of versions){
    const choice=document.createElement('option');
    choice.value=String(item.revision);
    choice.textContent='Revision '+item.revision+(item.recordedAt?' · '+item.recordedAt:'');
    historySelect.append(choice);
   }
   el('cloud-sync-history-restore').disabled=!versions.length;
   el('cloud-sync-history-result').textContent='Đã tải '+versions.length+' bản lịch sử.';
  }catch(error){el('cloud-sync-history-result').textContent='Lỗi lịch sử: '+error.message;}
  finally{toggleBusy(false);}
 });
 el('cloud-sync-history-restore').addEventListener('click',async()=>{
  const revision=Number(historySelect.value);
  const confirm=el('cloud-sync-history-confirm').value;
  if(!Number.isSafeInteger(revision)||confirm!=='RESTORE CLOUD'){
   el('cloud-sync-history-result').textContent='Chọn revision và nhập RESTORE CLOUD.';return;
  }
  if(!window.confirm('Khôi phục revision '+revision+' thành phiên bản Cloud mới?'))return;
  toggleBusy(true);resetPreview();
  try{
   const restored=await window.api.cloudSyncRestoreHistory(options(),revision,confirm);
   el('cloud-sync-history-result').textContent='Đã khôi phục bản '+restored.restoredFrom+
    ' thành revision '+restored.revision+' · '+restored.profiles+' hồ sơ.';
   el('cloud-sync-history-confirm').value='';
  }catch(error){el('cloud-sync-history-result').textContent='Không thể khôi phục: '+error.message;}
  finally{toggleBusy(false);}
 });
 const deviceArea=el('cloud-team-devices');
 function showDevices(data){
  deviceArea.replaceChildren();
  for(const d of data){
   const row=document.createElement('div');row.className='lhm-wm-row';
   const label=document.createElement('span');
   label.textContent=d.deviceId+' · '+d.subjectId+' · '+d.status;
   row.append(label);
   if(d.status==='active'){
    const button=document.createElement('button');
    button.type='button';button.className='btn btn-sm btn-danger';
    button.textContent='Thu hồi thiết bị';
    button.addEventListener('click',async()=>{
     if(!window.confirm('Thu hồi ngay thiết bị '+d.deviceId+'?'))return;
     toggleBusy(true);
     try{
      await window.api.cloudTeamRevokeDevice(credentials(),d.deviceId);
      showDevices(await window.api.cloudTeamDevices(credentials()));
      el('cloud-team-device-result').textContent='Đã thu hồi thiết bị '+d.deviceId+'.';
     }catch(error){el('cloud-team-device-result').textContent=error.message;}
     finally{toggleBusy(false);}
    });
    row.append(button);
   }
   deviceArea.append(row);
  }
  if(!data.length)deviceArea.textContent='Chưa có thiết bị.';
 }
 el('cloud-team-device-list').addEventListener('click',async()=>{
  toggleBusy(true);
  try{
   const devices=await window.api.cloudTeamDevices(credentials());
   showDevices(devices);
   el('cloud-team-device-result').textContent='Đã tải '+devices.length+' thiết bị.';
  }catch(error){el('cloud-team-device-result').textContent=error.message;}
  finally{toggleBusy(false);}
 });
 el('cloud-team-device-enroll').addEventListener('click',async()=>{
  const subjectId=el('cloud-team-device-subject').value.trim();
  const deviceId=el('cloud-team-device-id').value.trim();
  if(!subjectId||!deviceId){el('cloud-team-device-result').textContent='Nhập thành viên và mã thiết bị.';return;}
  if(!window.confirm('Cấp khóa thiết bị mới '+deviceId+' cho '+subjectId+'?'))return;
  toggleBusy(true);
  try{
   const enrolled=await window.api.cloudTeamEnrollDevice(credentials(),{subjectId,deviceId});
   el('cloud-team-device-result').textContent='Khóa một lần: '+enrolled.deviceKey+
    ' · Sao chép qua kênh riêng. Không chia sẻ công khai.';
  }catch(error){el('cloud-team-device-result').textContent='Lỗi cấp thiết bị: '+error.message;}
  finally{toggleBusy(false);}
 });
});
