'use strict';
/**
 * LHM Customer Handoff: evidence-based local diagnostics only.
 * Never mark product as commercially approved from local runtime signals.
 * Strict projection: NO installation ID, token, account, profile names,
 * proxy addresses, file paths, or raw error messages leave main process.
 */
const STATES=new Set(['ready','warning','error','planned','unknown']);
const MAX_COUNT=100000;
function count(x){return Number.isSafeInteger(x)&&x>=0?Math.min(MAX_COUNT,x):0;}
function buildCustomerHandoff({appInfo,license,update,upgrade,local,now=()=>new Date().toISOString()}={}){
 if(!appInfo||typeof appInfo.packaged!=='boolean'||!license||
   !update||!upgrade||!local||!Array.isArray(local.items))
   throw Error('Incomplete customer handoff diagnostics');
 if(upgrade.schema!=='lhm.upgrade.safety.v1')throw Error('Unrecognized upgrade inspection contract');
 const checks=[];
 const add=(code,title,state,note)=>checks.push({code,title,state,note});
 add('package','Bộ cài ứng dụng',appInfo.packaged?'ready':'warning',
     appInfo.packaged?'Đang chạy bản ứng dụng đóng gói.':'Đang chạy bản phát triển; phải nghiệm thu installer EXE riêng.');
 const access=license.access;
 add('license','Cấp phép và gia hạn',
   access==='licensed'?'ready':access==='blocked'?'error':'warning',
   access==='licensed'?'Có license hiệu lực theo chính sách cục bộ.':
   access==='trial'?'Đang dùng thử; chưa chứng minh cấp phép thuê thương mại.':
   access==='blocked'?'License không cho phép khởi chạy tính năng có kiểm soát.':
   'Không xác định được quyền cấp phép.');
 const connected=license.online && typeof license.online==='object' &&
   license.online.state && !['not-configured','unconfigured'].includes(license.online.state);
 add('license-authority','Xác minh license qua máy chủ',
   connected?'warning':'warning',
   connected?'Có trạng thái xác minh online; vẫn cần nghiệm thu dịch vụ thật và gia hạn/thu hồi.':
   'Không thấy bằng chứng máy chủ xác minh đang được sử dụng. License offline vẫn có thể hoạt động.');
 add('signed-updates','Nhận cập nhật có chữ ký',
   update.configured===true?'ready':'warning',
   update.configured===true?
    'Có khóa công khai Ed25519; chưa chứng minh máy chủ có manifest/bản cập nhật hợp lệ.':
    'Chưa cấu hình khóa công khai cập nhật. Tải cập nhật online phải bị khóa an toàn.');
 add('local-data','Dữ liệu khi nâng cấp',
   upgrade.status==='blocked'?'error':'warning',
   upgrade.status==='blocked'?'Kiểm tra dữ liệu cục bộ có lỗi; chưa được cài nâng cấp.':
   'Chỉ kiểm tra đọc dữ liệu; chưa sao lưu cookie/phiên hay xác minh installer trên máy khách.');
 const relevant=local.items.filter(x=>x&&x.status!=='planned');
 const errors=relevant.filter(x=>x.status==='error').length;
 const warnings=relevant.filter(x=>x.status==='warning'||!STATES.has(x.status)).length;
 add('profile-health','Hồ sơ, trình duyệt và proxy',
   errors?'error':warnings?'warning':'ready',
   errors?'Có '+count(errors)+' nhóm chẩn đoán cấu hình bị lỗi.':
   warnings?'Có '+count(warnings)+' nhóm cần rà soát cấu hình.':
   'Không thấy lỗi ở các chỉ số cấu hình cục bộ đã kiểm tra.');
 const blocked=checks.some(x=>x.state==='error');
 const attention=checks.some(x=>x.state==='warning');
 const status=blocked?'blocked':attention?'review':'local_checks_only';
 return {
   schema:'lhm.customer.handoff.v1',
   createdAt:now(),
   scope:'read_only_local_configuration_and_user_handoff',
   status,
   version:/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(String(appInfo.version))?
     appInfo.version:'unknown',
   environment:{
      platform:['win32','darwin','linux'].includes(appInfo.platform)?appInfo.platform:'unknown',
      arch:['x64','arm64','ia32'].includes(appInfo.arch)?appInfo.arch:'unknown',
      packaged:appInfo.packaged
   },
   counts:{
     profiles:count(local.counts?.profiles),
     active:count(local.counts?.active),
     proxies:count(local.counts?.proxies),
     workflows:count(local.counts?.workflows),
     configErrors:count(local.counts?.errors),
     configWarnings:count(local.counts?.warnings),
     upgradeActiveBrowsers:count(upgrade.activeBrowsers)
   },
   checks,
   requiredBeforePublicRelease:[
     {code:'windows-customer-acceptance',status:'NOT_VERIFIED',
       note:'Phải cài đặt, cập nhật và khôi phục trên máy Windows khách độc lập.'},
     {code:'signed-update-end-to-end',status:'NOT_VERIFIED',
       note:'Phải kiểm tra manifest thật, chữ ký nhà phát hành và SHA-256 bộ cài.'},
     {code:'monthly-license-and-payment',status:'NOT_VERIFIED',
       note:'Phải nghiệm thu gia hạn/thu hồi, máy chủ thật, thanh toán và hỗ trợ.'},
     {code:'publisher-owner-approval',status:'NOT_VERIFIED',
       note:'Chủ dự án phải duyệt phát hành; CI không thể xác nhận thay.'}
   ],
   privacy:{
     outboundRequests:0,
     changedFiles:0,
     includesProfileIds:false,
     includesSecrets:false,
     includesInstallationId:false,
     exportedOnlyOnUserAction:true
   },
   outcome:'LOCAL_HANDOFF_DIAGNOSTIC_NOT_PUBLIC_RELEASE_APPROVAL'
 };
}
module.exports={buildCustomerHandoff};
