'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-license-center');
 const msg=el('license-message'),code=el('license-token');
 const {messageForBlockedLicense}=window.LHMLicenseBlockMessage;
 const statusText={active:'Đang hiệu lực',expired:'Hết hạn',inactive:'Chưa kích hoạt',
  invalid:'License không hợp lệ',different_installation:'Sai mã cài đặt',
  clock_error:'Đồng hồ hệ thống bất thường',not_yet_valid:'Chưa đến ngày bắt đầu',
  owner_sweep_pending:'Đã hết kỳ thuê · chờ lần quét có chữ ký của chủ sở hữu',
  owner_sweep_unenrolled:'Chưa đăng ký license thuê với máy chủ chủ sở hữu',
  owner_sweep_authority_unconfigured:'Chưa cấu hình máy chủ xác minh license thuê'};
 // Activation errors come from src/licensing/manager.js in English; show the
 // customer what happened and what to do next. Unknown messages pass through.
 const activationHelp=[
  [/License format not recognized|Invalid license encoding|License JSON is invalid|Invalid license fields|Unexpected license claims|Invalid license entitlements|Invalid license period/,
   'Mã license không đúng định dạng. Hãy dán lại đầy đủ mã bên bán gửi, không thừa hoặc thiếu ký tự.'],
  [/Invalid license signature|License signature mismatch/,
   'Mã license không có chữ ký hợp lệ của bên phát hành. Hãy xin lại mã từ bên bán.'],
  [/different installation ID/,
   'Mã license này được cấp cho một mã cài đặt khác. Gửi đúng mã cài đặt của máy này cho bên bán để cấp lại.'],
  [/License expired/,'Mã license đã hết hạn. Liên hệ bên bán để gia hạn.'],
  [/License is not active yet/,'Mã license chưa đến ngày hiệu lực. Kiểm tra lại ngày giờ của máy.'],
  [/clock|System clock/i,'Ngày giờ của máy có vẻ bị chỉnh lùi hoặc không hợp lệ. Đặt lại ngày giờ đúng rồi thử lại.'],
  [/Installation identity requires manual repair|Trial state invalid/,
   'Dữ liệu cài đặt cần bên bán hỗ trợ. Gửi mã cài đặt và ảnh chụp màn hình này cho bên bán.']
 ];
 const explainActivation=message=>{
  const hit=activationHelp.find(([pattern])=>pattern.test(String(message||'')));
  return hit?hit[1]:String(message||'Lỗi không xác định');
 };
 async function refresh(){
  const [state,service]=await Promise.all([
   window.api.getLicenseStatus(),window.api.getLicenseServiceStatus()
  ]);
  el('license-installation-id').value=state.installationId;
  el('license-state').textContent=state.access==='trial'
    ?'Dùng thử · còn '+state.trialDaysLeft+' ngày'
    :state.access==='blocked'?'Bị giới hạn · '+(state.online?.state||statusText[state.status]||state.reason)
    :statusText[state.status]||state.status;
  el('license-plan').textContent=state.plan||(state.trial?'Dùng thử':'—');
  el('license-expires').textContent=state.expiresAt
   ?new Date(state.expiresAt).toLocaleDateString('vi-VN')+
    (state.active?' · '+state.remainingDays+' ngày còn lại':'')
   :'—';
  el('license-limit').textContent=state.maxProfiles===null?'—':state.maxProfiles+' hồ sơ';
  el('license-features').textContent=state.allowed
   ?'Quyền: '+(state.features||[]).join(', ')+(state.trial?' · Giới hạn 10 hồ sơ':'')
   :'Chế độ giữ dữ liệu: có thể xem, xuất và khôi phục; hãy gia hạn để chạy tiếp.';
  el('license-deactivate').disabled=state.status==='inactive';
  const remote=state.online;
  const host=service.authorityHost||'';
  const prefix=service.configured
   ?'Máy chủ xác minh: '+host+' (đã cấu hình; chưa kiểm tra kết nối). '
   :'Máy chủ xác minh: chưa được cấu hình trong bản cài này. ';
  el('license-online-state').textContent=prefix+
   (!service.configured?'Bản Preview chưa kích hoạt xác minh online.':
    !service.hasActiveSignedLicense?'Cần kích hoạt license có chữ ký hợp lệ để xác minh.':
    remote?'Giấy phép: '+remote.state+
     (remote.checkedAt?' · '+new Date(remote.checkedAt).toLocaleString('vi-VN'):'')+
     (remote.graceExpiresAt?' · hạn offline '+new Date(remote.graceExpiresAt).toLocaleString('vi-VN'):'')
     :'Giấy phép chưa có biên nhận online.');
  el('license-verify-online').disabled=!service.canVerifyNow;
  return state;
 }
 async function show(announcement=''){
  modal.classList.add('open');msg.textContent='';
  try{
   const state=await refresh();
   if(announcement)msg.textContent=announcement;
   return state;
  }catch(error){msg.textContent='Không đọc được trạng thái: '+error.message;return null;}
 }
 el('btn-license-center').addEventListener('click',()=>show());
 function close(){code.value='';modal.classList.remove('open');}
 for(const id of ['license-center-close','license-done'])el(id).addEventListener('click',close);
 el('license-refresh').addEventListener('click',()=>refresh().catch(e=>{msg.textContent=e.message;}));
 el('license-verify-online').addEventListener('click',async()=>{
  const button=el('license-verify-online');button.disabled=true;
  try{
   const outcome=await window.api.verifyLicenseOnline();
   msg.textContent=outcome.result.configured===false?'Máy chủ xác minh chưa được cấu hình.':'Máy chủ trả về: '+outcome.result.state;
  }catch(error){msg.textContent='Không kiểm tra được máy chủ: '+error.message;}
  finally{await refresh().catch(()=>{button.disabled=true;});}
 });
 el('license-copy-installation').addEventListener('click',async()=>{
  try{await window.api.copyInstallationId();msg.textContent='Đã sao chép mã cài đặt.';}
  catch(error){msg.textContent=error.message;}
 });
 el('license-activate').addEventListener('click',async()=>{
  const token=code.value.trim();
  if(!token){msg.textContent='Dán mã license do bên phát hành cung cấp.';return;}
  const btn=el('license-activate');btn.disabled=true;
  try{
   const updated=await window.api.activateLicense(token);
   msg.textContent=updated.active?'Đã kích hoạt thành công.':'License không ở trạng thái hiệu lực.';
   code.value='';await refresh();
  }catch(error){msg.textContent='Kích hoạt thất bại: '+explainActivation(error.message);}
  finally{btn.disabled=false;}
 });
 el('license-deactivate').addEventListener('click',async()=>{
  if(!confirm('Xóa mã license được lưu trên thiết bị này? Việc này không thu hồi license trên máy chủ phát hành.'))return;
  try{
   await window.api.deactivateLicense();
   code.value='';msg.textContent='Đã xóa license cục bộ.';await refresh();
  }catch(error){msg.textContent=error.message;}
 });
 async function ensureProfilesAllowed(){
  try{
   const state=await window.api.getLicenseStatus();
   if(state?.allowed===true)return true;
   await show(messageForBlockedLicense(state));
   code.focus();
   return false;
  }catch(error){
   await show('Không kiểm tra được giấy phép: '+error.message);
   return false;
  }
 }
 async function handleOperationError(error){
  const detail=String(error?.message||error||'');
  if(!/Giấy phép hết hạn|bị thu hồi|chưa được máy chủ xác minh|license/i.test(detail))
   return false;
  try{
   const state=await window.api.getLicenseStatus();
   if(state?.allowed===true)return false;
   await show(messageForBlockedLicense(state));
   code.focus();
   return true;
  }catch(_){return false;}
 }
 window.LHMLicenseCenter = {show,refresh,ensureProfilesAllowed,handleOperationError};
});
