'use strict';
(function expose(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.LHMLicenseBlockMessage=api;
})(typeof window==='object'?window:null,()=>{
 function messageForBlockedLicense(state){
  if(!state||state.allowed===true||state.access==='licensed'||state.access==='trial')return null;
  const reason=state.online?.state||state.reason||state.status||'blocked';
  const messages={
   trial_expired:'Thời gian dùng thử 10 ngày đã kết thúc. Hồ sơ và dữ liệu vẫn được giữ nguyên. Hãy kích hoạt hoặc gia hạn giấy phép để mở trình duyệt.',
   expired:'Giấy phép đã hết hạn. Hồ sơ và dữ liệu vẫn được giữ nguyên. Hãy gia hạn và nhập mã giấy phép mới để mở trình duyệt.',
   revoked:'Giấy phép đã bị thu hồi. Hồ sơ và dữ liệu vẫn được giữ nguyên. Hãy liên hệ bên phát hành để kiểm tra hoặc cấp lại quyền sử dụng.',
   invalid:'Mã giấy phép đang lưu không hợp lệ. Hãy nhập lại mã do bên phát hành cung cấp.',
   different_installation:'Mã giấy phép thuộc một mã cài đặt khác. Hãy cung cấp mã cài đặt hiện tại cho bên phát hành để nhận mã đúng máy.',
   clock_error:'Không thể xác minh thời hạn vì ngày giờ Windows không nhất quán. Hãy bật đồng bộ ngày giờ tự động, khởi động lại ứng dụng rồi kiểm tra lại.',
   not_yet_valid:'Giấy phép chưa đến ngày bắt đầu. Hãy kiểm tra ngày giờ Windows hoặc liên hệ bên phát hành.',
   owner_sweep_unenrolled:'Giấy phép thuê chưa được đăng ký với máy chủ xác minh. Hãy liên hệ bên phát hành.',
   owner_sweep_authority_unconfigured:'Bản cài chưa được cấu hình máy chủ xác minh giấy phép thuê. Hãy liên hệ bên phát hành.',
   unverified:'Chưa xác minh được giấy phép với máy chủ. Hãy kiểm tra kết nối hoặc liên hệ bên phát hành.'
  };
  return messages[reason]||
   'Giấy phép chưa cho phép mở trình duyệt. Hồ sơ và dữ liệu vẫn được giữ nguyên. Hãy mở Trung tâm giấy phép để kiểm tra và kích hoạt.';
 }
 return {messageForBlockedLicense};
});
