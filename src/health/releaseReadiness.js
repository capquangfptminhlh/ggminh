'use strict';

/**
 * Local configuration readiness, NOT a browser anonymity or anti-fraud score.
 * Produces safe summaries; never exposes vault contents or session data.
 */
function buildReadiness({ profiles=[], reports=[], proxies=[], active=[], workflows=[],
  vault=null, platform=process.platform }={}) {
  const items=[];
  const push=(key,label,status,detail)=>items.push({key,label,status,detail});
  const errors=reports.filter(r=>r.status==='error').length;
  const warnings=reports.filter(r=>r.status==='warning').length;
  const needsBinary=reports.filter(r=>r.issues?.some(issue=>issue.code==='browser_missing')).length;
  push('profiles','Cấu hình hồ sơ',errors?'error':warnings?'warning':'ready',
    errors ? errors+' hồ sơ có lỗi cần xử lý.' :
      warnings ? warnings+' hồ sơ có cảnh báo cấu hình.' : 'Không tìm thấy lỗi trong các hồ sơ đã kiểm tra.');
  push('browser','Browser engine cài đặt',needsBinary?'error':'ready',
    needsBinary ? needsBinary+' hồ sơ chưa có Chrome/Edge/Firefox tương thích.' :
      'LHM sử dụng Chrome/Edge/Firefox cài trên máy. Đây chưa phải browser core riêng.');
  const linked=profiles.filter(p=>p.proxy?.authProxyId);
  let vaultReady=false;
  try{vaultReady=!!vault?.available();}catch(_){vaultReady=false;}
  push('vault','Bảo vệ mật khẩu proxy',linked.length&&!vaultReady?'error':!vaultReady?'warning':'ready',
    !vaultReady ? 'Mã hóa cấp hệ điều hành chưa sẵn sàng. Không nhập mật khẩu mới.' :
      'Kho mật khẩu mã hóa đang khả dụng. Có '+linked.length+' hồ sơ liên kết proxy xác thực.');
  const known=new Map(proxies.map(p=>[p.id,p]));
  const orphan=linked.filter(p=>{
    const found=known.get(p.proxy.authProxyId);
    return !found || found.type!==p.proxy.type ||
      found.host!==p.proxy.host || Number(found.port)!==Number(p.proxy.port) ||
      !vault?.has(p.proxy.authProxyId);
  });
  push('auth-links','Liên kết proxy xác thực',orphan.length?'error':'ready',
    orphan.length?orphan.length+' hồ sơ cần gán lại proxy/mật khẩu.' :
      'Không có liên kết proxy xác thực bị thiếu hoặc không khớp.');
  const custom=profiles.filter(p=>p.engine!=='gecko' && p.fingerprint?.mode!=='native').length;
  push('native','Thông số trình duyệt gốc',custom?'warning':'ready',
    custom ? custom+' hồ sơ đang dùng tùy chỉnh fingerprint thử nghiệm; chưa kiểm chứng.' :
      'Các hồ sơ Chromium được kiểm tra sử dụng thông số gốc.');
  const unverified=proxies.filter(p=>p.check?.verified!==true).length;
  push('network','Xác minh IP thoát',unverified?'warning':'ready',
    proxies.length===0?'Chưa lưu proxy. Kết nối trực tiếp chưa được đo ở bước này.' :
      unverified+' / '+proxies.length+' proxy chưa xác minh IP trong phiên này.');
  push('runtime','Trình duyệt LHM đóng gói riêng','planned',
    'Chưa triển khai; ứng dụng hiện chạy các browser được cài sẵn trên máy.');
  push('cloud','Đồng bộ cloud / nhân viên / AI Agent','planned',
    'Chưa triển khai. Không có dữ liệu cloud hoặc điểm nhận diện Google được đo.');
  return {
    checkedAt:new Date().toISOString(),platform,
    counts:{profiles:profiles.length,active:active.length,proxies:proxies.length,workflows:workflows.length,
      errors,warnings,authenticatedProfiles:linked.length,unmatchedCredentials:orphan.length},
    items,
    note:'Kiểm tra chỉ dựa trên cấu hình cục bộ và kết quả chẩn đoán sẵn có. Không đo khả năng bị nền tảng quảng cáo nhận diện.'
  };
}
module.exports={buildReadiness};
