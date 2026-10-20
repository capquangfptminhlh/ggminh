'use strict';
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-license-center');
 const msg=el('license-message'),code=el('license-token');
 const statusText={active:'Đang hiệu lực',expired:'Hết hạn',inactive:'Chưa kích hoạt',
  invalid:'License không hợp lệ',different_installation:'Sai mã cài đặt',
  clock_error:'Đồng hồ hệ thống bất thường',not_yet_valid:'Chưa đến ngày bắt đầu'};
 async function refresh(){
  const state=await window.api.getLicenseStatus();
  el('license-installation-id').value=state.installationId;
  el('license-state').textContent=statusText[state.status]||state.status;
  el('license-plan').textContent=state.plan||'—';
  el('license-expires').textContent=state.expiresAt
   ?new Date(state.expiresAt).toLocaleDateString('vi-VN')+
    (state.active?' · '+state.remainingDays+' ngày còn lại':'')
   :'—';
  el('license-limit').textContent=state.maxProfiles===null?'—':state.maxProfiles+' hồ sơ';
  el('license-deactivate').disabled=state.status==='inactive';
 }
 async function show(){
  modal.classList.add('open');msg.textContent='';
  try{await refresh();}catch(error){msg.textContent='Không đọc được trạng thái: '+error.message;}
 }
 el('btn-license-center').addEventListener('click',show);
 function close(){code.value='';modal.classList.remove('open');}
 for(const id of ['license-center-close','license-done'])el(id).addEventListener('click',close);
 el('license-refresh').addEventListener('click',()=>refresh().catch(e=>{msg.textContent=e.message;}));
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
  }catch(error){msg.textContent='Kích hoạt thất bại: '+error.message;}
  finally{btn.disabled=false;}
 });
 el('license-deactivate').addEventListener('click',async()=>{
  if(!confirm('Xóa mã license được lưu trên thiết bị này? Việc này không thu hồi license trên máy chủ phát hành.'))return;
  try{
   await window.api.deactivateLicense();
   code.value='';msg.textContent='Đã xóa license cục bộ.';await refresh();
  }catch(error){msg.textContent=error.message;}
 });
});