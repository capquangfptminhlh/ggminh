'use strict';
/**
 * Client-ready, user-initiated OFFLINE QA evidence for ad campaign launches.
 * "confirmed" represents a user attestation, never machine verification.
 * Never persist/raw-echo input URLs, queries, paths, tokens or cookies.
 */
const crypto = require('node:crypto');
const {inspectLandingUrls} = require('./landingGuard');

const CHECKS = Object.freeze([
  {id:'live_landing',label:'Đã tự mở landing page và thử trên thiết bị thực'},
  {id:'conversion_event',label:'Đã tạo chuyển đổi thử và kiểm tra sự kiện thực tế'},
  {id:'ga4_or_meta_pixel',label:'Đã kiểm tra GA4 / GTM / Meta Pixel (nếu áp dụng)'},
  {id:'tracking_attribution',label:'Đã xác minh UTM hoặc auto-tagging và phép đo nguồn truy cập'},
  {id:'ad_account_permissions',label:'Đã kiểm tra quyền truy cập tài khoản quảng cáo hợp lệ'},
  {id:'budget_and_schedule',label:'Đã duyệt ngân sách, giá thầu và lịch chạy'},
  {id:'creative_policy',label:'Đã rà nội dung quảng cáo, nội dung trang đích và chính sách nền tảng'}
]);
const STATES = new Set(['not-checked','confirmed','needs-work','not-applicable']);
const MAX_JSON = 35000;
function normalizeChecks(selection) {
  if (!selection || typeof selection!=='object' || Array.isArray(selection))
    throw Error('Tình trạng checklist không hợp lệ.');
  const allowed = new Set(CHECKS.map(x=>x.id));
  for(const key of Object.keys(selection))
    if(!allowed.has(key))throw Error('Mục checklist không xác định.');
  return CHECKS.map(entry=>{
    const status = selection[entry.id] === undefined ? 'not-checked' : selection[entry.id];
    if(typeof status!=='string'||!STATES.has(status))
      throw Error('Checklist chỉ nhận not-checked, confirmed, needs-work hoặc not-applicable.');
    return {...entry,status,evidence:'user_attestation_only'};
  });
}
function buildCampaignQaReport({urls,checks}, clock=()=>Date.now()) {
  if(typeof urls!=='string')throw Error('Cần nhập danh sách URL để kiểm tra.');
  const entries=normalizeChecks(checks);
  const scan=inspectLandingUrls(urls); // recompute on EVERY export: no stale checks
  const iso = new Date(clock()).toISOString();
  const summary={
    offlineUrls:scan.checked,
    urlBlocked:scan.blocked,urlNeedsReview:scan.review,
    urlNoSyntaxWarnings:scan.ready,
    userConfirmed:entries.filter(x=>x.status==='confirmed').length,
    userNeedsWork:entries.filter(x=>x.status==='needs-work').length,
    userNotChecked:entries.filter(x=>x.status==='not-checked').length,
    userNotApplicable:entries.filter(x=>x.status==='not-applicable').length
  };
  const decision = (summary.urlBlocked||summary.userNeedsWork)?'NEEDS_CORRECTION':
    (summary.urlNeedsReview||summary.userNotChecked)?'REQUIRES_REVIEW':'LOCAL_QA_RECORDED';
  const body={
    schema:'lhm.ads.qa.v1',
    generatedAt:iso,
    scope:'offline_url_check_plus_user_attestation',
    decision,
    summary,
    destinations:scan.items.map(item=>({
      index:item.index,
      origin:item.destination, // existing module strips pathname/query/hash
      result:item.status,
      findings:item.findings.map(f=>({severity:f.level,code:f.code,message:f.message})),
      httpChecked:false,
      liveTrackingChecked:false
    })),
    manualChecks:entries,
    assertions:{
      externalRequestsPerformed:0,
      liveDestinationVerified:false,
      conversionVerifiedBySoftware:false,
      pixelVerifiedBySoftware:false,
      providerAccountApprovalVerified:false,
      platformDetectionResult:'NOT_MEASURED'
    },
    disclaimer:'Trạng thái confirmed chỉ là người lập báo cáo tự xác nhận; LHM không đo hay bảo đảm hiệu quả, chuyển đổi, tính hợp lệ hoặc phê duyệt Google/Meta. Kết quả URL chỉ là kiểm tra cú pháp cục bộ.'
  };
  const canonical=JSON.stringify(body);
  const digest=crypto.createHash('sha256').update(canonical,'utf8').digest('hex');
  const report={...body,integrity:{
    algorithm:'SHA-256',
    bodySha256:digest,
    meaning:'Checksum nội dung báo cáo, không phải chữ ký số hay xác nhận sự thật'
  }};
  const serialized=JSON.stringify(report,null,2)+'\n';
  if(Buffer.byteLength(serialized,'utf8')>MAX_JSON)
    throw Error('Báo cáo vượt giới hạn 35 KB; hãy giảm số URL.');
  return {report,text:serialized};
}
module.exports={CHECKS,STATES,normalizeChecks,buildCampaignQaReport};
