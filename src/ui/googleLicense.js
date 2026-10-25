'use strict';
// Renderer receives only pairing comparison code and non-secret subscription
// status; OAuth and signed grants remain behind main-process IPC.
window.addEventListener('DOMContentLoaded',async()=>{
 const el=id=>document.getElementById(id);
 const panel=el('google-license-panel');
 if(!panel||!window.api?.googleLicenseStatus)return;
 let current;
 try{current=await window.api.googleLicenseStatus();}
 catch(_){return;}
 if(!current?.enabled)return;
 panel.hidden=false;
 const modal=el('modal-license-center');
 const old=modal?.querySelector('.lhm-nm-license-stage');
 if(old)old.style.display='none';
 const legacyHelp=modal?.querySelector('.modal-body > .lhm-bulk-help');
 if(legacyHelp)legacyHelp.hidden=true;
 const labels={
   SIGNIN_REQUIRED:'Chưa đăng nhập Gmail. Chọn Đăng nhập bằng Google.',
   LEASE_INVALID_OR_EXPIRED:'Thuê bao chưa có hiệu lực hoặc lease đã hết hạn. Hãy kiểm tra thanh toán.',
   SEAT_REPLACED:'Thiết bị đã bị thay phiên hoặc bị thu hồi.',
   CLOCK_ROLLBACK:'Đồng hồ Windows đã bị chỉnh lùi. Vui lòng kiểm tra lại.',
   NETWORK_UNAVAILABLE:'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại.',
   SUBSCRIPTION_REQUIRED:'Chưa có thuê bao đang hiệu lực. Chọn gói và thanh toán VietQR.',
   SEAT_LIMIT:'Gói đã sử dụng hết phiên thiết bị. Chọn máy cần thay thế.',
   PAIR_PENDING:'Cần xác nhận mã ghép máy trong trình duyệt Google.',
   PAIR_ALREADY_CLAIMED:'Yêu cầu này đã ghép. Hãy kiểm tra trạng thái tài khoản.'
 };
 const message=(value)=>{
   const str=String(value??'');
   const code=Object.keys(labels).find(key=>str===key||str.endsWith(': '+key));
   el('google-login-state').textContent=code?labels[code]:str;
 };
 const lock=async(id,callback)=>{
   const button=el(id);if(!button||button.disabled)return;
   button.disabled=true;
   try{await callback();}
   catch(e){message(e?.message||'Không thể thực hiện. Kiểm tra kết nối hoặc thử lại.');}
   finally{button.disabled=false;}
 };
 async function update(){
   const status=await window.api.googleLicenseStatus();
   current=status;
   el('google-account-email').textContent=status.email?'Tài khoản Google: '+status.email:'';
   el('google-login-start').hidden=!!status.paired;
   el('google-login-claim').hidden=!status.pending||!!status.paired;
   el('google-login-code').hidden=!status.pending||!!status.paired;
   el('google-activate').hidden=!status.paired||!status.tenantReady;
   el('google-devices').hidden=!status.paired||!status.tenantReady;
   el('google-restart').hidden=!status.paired||!!status.tenantReady;
   el('google-logout').hidden=!status.paired;
   if(status.allowed)
     message('Gói '+status.plan+' đang hoạt động · tối đa '+status.maxProfiles+
       ' hồ sơ · '+status.seatLimit+' thiết bị · hết hạn '+
       new Date(status.validUntil).toLocaleString('vi-VN'));
   else if(status.paired&&!status.tenantReady)
     message('Đã ghép Gmail. Khởi động lại để mở vùng dữ liệu dành riêng cho tài khoản.');
   else if(status.paired)message(labels[status.reason]||
       'Đã đăng nhập Gmail. Hãy thanh toán và chọn Kiểm tra và kích hoạt thuê bao.');
   else message(labels[status.reason]||'Đăng nhập Gmail để sử dụng phần mềm.');
 }
 async function listDevices(){
   const list=el('google-device-list');
   list.replaceChildren();
   const info=await window.api.googleLicenseDevices();
   if(!info.devices?.length){
     const p=document.createElement('p');
     p.textContent='Chưa có thiết bị đang hoạt động.';list.append(p);return;
   }
   for(const device of info.devices){
     const row=document.createElement('div');row.className='lhm-google-device-item';
     const name=document.createElement('strong');name.textContent=device.label;
     const button=document.createElement('button');
     button.type='button';button.className='btn btn-secondary';
     button.textContent='Thay thế máy này';
     button.addEventListener('click',()=>lock('google-devices',async()=>{
       if(!window.confirm('Thay thế phiên của '+device.label+'? Thiết bị cũ sẽ bị thu hồi quyền ghép trước đó và phải xác nhận Gmail lại nếu muốn sử dụng.'))return;
       await window.api.googleLicenseReplace(device.seatId,'REPLACE');
       message('Đã thay phiên thiết bị và cập nhật bản quyền.');
       await update();list.replaceChildren();
     }));
     row.append(name,button);list.append(row);
   }
 }
 el('google-login-start').addEventListener('click',()=>lock('google-login-start',async()=>{
   const result=await window.api.googleLicenseStart();
   el('google-login-comparison').textContent=result.comparisonCode;
   el('google-login-code').hidden=false;
   el('google-login-claim').hidden=false;
   message('Đã mở trình duyệt mặc định. Đăng nhập Gmail và nhập mã 6 số đang hiển thị ở đây.');
 }));
 el('google-login-claim').addEventListener('click',()=>lock('google-login-claim',async()=>{
   const result=await window.api.googleLicenseClaim();
   message(result.restartRequired?'Đã ghép Gmail. Khởi động lại phần mềm để tiếp tục.':'Đã đăng nhập Gmail.');
   await update();
 }));
 el('google-open-plans').addEventListener('click',()=>lock('google-open-plans',async()=>{
   await window.api.googleLicensePlans();
   message('Đã mở trang gói thuê bao trong trình duyệt mặc định.');
 }));
 el('google-activate').addEventListener('click',()=>lock('google-activate',async()=>{
   try{
     await window.api.googleLicenseActivate();
     await update();el('google-device-list').replaceChildren();
   }catch(e){
     if(String(e?.message||'').includes('SEAT_LIMIT'))await listDevices();
     throw e;
   }
 }));
 el('google-devices').addEventListener('click',()=>lock('google-devices',listDevices));
 el('google-restart').addEventListener('click',()=>lock('google-restart',async()=>{
   await window.api.googleLicenseRestart();
 }));
 el('google-logout').addEventListener('click',()=>lock('google-logout',async()=>{
   if(!window.confirm('Đăng xuất Gmail trên Windows? Dữ liệu profile vẫn được lưu riêng trên máy.'))return;
   await window.api.googleLicenseLogout();
   message('Đã đăng xuất. Phần mềm sẽ khởi động lại để đóng vùng dữ liệu tài khoản cũ.');
 }));
 el('btn-license-center')?.addEventListener('click',()=>update().catch(e=>message(e.message)));
 await update();
 // Show Google sign-in on first launch rather than leaving an unusable,
 // unpaid browser workspace with no explanation.
 if(!current?.allowed)el('btn-license-center')?.click();
});
