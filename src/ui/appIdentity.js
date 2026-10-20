'use strict';
// Get the version from Electron, never from a manually maintained HTML label.
window.addEventListener('DOMContentLoaded',()=>{
 const el=id=>document.getElementById(id),modal=el('modal-app-about');
 const message=el('lhm-about-message');
 async function refreshIdentity(){
  try{
   const info=await window.api.getAppInfo();
   if(!info||info.name!=='LHM Ads Browser'||
      !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(info.version)||
      !['win32','linux','darwin'].includes(info.platform)||
      !['x64','arm64','ia32'].includes(info.arch)||
      typeof info.packaged!=='boolean')throw Error('Thông tin ứng dụng không hợp lệ');
   const display='v'+info.version;
   el('lhm-header-version').textContent=display;
   el('lhm-nav-version').textContent=display;
   el('lhm-about-version').textContent=display;
   const names={win32:'Windows',linux:'Linux',darwin:'macOS'};
   el('lhm-about-platform').textContent=names[info.platform]+' · '+info.arch;
   el('lhm-about-build').textContent=info.packaged?
     'Ứng dụng đã đóng gói':'Bản chạy từ mã nguồn (Developer)';
   document.title='LHM Ads Browser '+display+' — Workspace';
   document.body.dataset.versionReady='true';
  }catch(error){
   document.body.dataset.versionReady='false';
   el('lhm-header-version').textContent='Không xác định';
   el('lhm-nav-version').textContent='Không xác định';
   message.textContent='Không tải được phiên bản ứng dụng: '+error.message;
  }
 }
 async function refreshLicense(){
  try{
   const state=await window.api.getLicenseStatus();
   const mode=state.access==='trial'?'Dùng thử · '+state.trialDaysLeft+' ngày còn lại'
     :state.access==='licensed'?(state.plan||'License')+' · Đang hiệu lực'
     :state.access==='blocked'?'Bị giới hạn · '+(state.online?.state||state.reason||state.status)
     :'Chưa kích hoạt';
   el('lhm-about-license').textContent=mode;
  }catch(error){
   el('lhm-about-license').textContent='Chưa đọc được trạng thái';
   message.textContent='Không đọc được license: '+error.message;
  }
 }
 async function refresh(){
  message.textContent='';
  await Promise.all([refreshIdentity(),refreshLicense()]);
 }
 refreshIdentity();
 const close=()=>modal.classList.remove('open');
 el('btn-app-about').addEventListener('click',()=>{modal.classList.add('open');refresh();});
 el('lhm-about-refresh').addEventListener('click',refresh);
 el('lhm-about-done').addEventListener('click',close);
 el('lhm-about-close').addEventListener('click',close);
 modal.addEventListener('click',event=>{if(event.target===modal)close();});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modal.classList.contains('open'))close();
 });
});
