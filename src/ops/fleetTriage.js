'use strict';
/**
 * LHM Fleet Triage: actionable, read-only classification of existing
 * checkProfile() evidence. No IP, URL, credential, name, profile ID, notes or
 * arbitrary check message crosses this boundary. No platform risk scores.
 */
const ACTIONS=Object.freeze({
  browser:{title:'Engine chưa khả dụng',description:'Kiểm tra Chrome, Edge hoặc Firefox đã cài và đường dẫn engine.',action:'engines',label:'Kiểm tra engine',priority:0},
  proxy:{title:'Proxy hoặc kho mật khẩu',description:'Kiểm tra lại proxy, liên kết xác thực và mã hóa mật khẩu.',action:'proxy',label:'Mở Proxy Center',priority:1},
  signal:{title:'Cấu hình Signal Chain',description:'Rà lại thông số máy và trình duyệt đã khai báo, tránh cấu hình không tương thích.',action:'health',label:'Xem Health Check',priority:2},
  starturl:{title:'URL mở mặc định',description:'Kiểm tra URL ban đầu và dữ liệu nhập vào hồ sơ.',action:'health',label:'Xem Health Check',priority:3},
  identity:{title:'Thông số trình duyệt tùy chỉnh',description:'Đối chiếu UA và các giá trị được khai báo với trình duyệt gốc.',action:'health',label:'Xem Health Check',priority:4},
  profile:{title:'Hồ sơ thiếu thông tin',description:'Mở Health Check để kiểm tra các trường cấu hình cơ bản.',action:'health',label:'Xem Health Check',priority:5},
  other:{title:'Lỗi cấu hình khác',description:'Kiểm tra báo cáo cấu hình đã có; không tự sửa khi chưa rõ nguyên nhân.',action:'health',label:'Xem Health Check',priority:6}
});
function groupFor(code){
  if(typeof code!=='string')return 'other';
  if(code==='browser_missing')return 'browser';
  if(code==='proxy_setup_required'||code.startsWith('proxy_'))return 'proxy';
  if(code.startsWith('signal_'))return 'signal';
  if(code==='invalid_starturl')return 'starturl';
  if(code==='ua_outdated'||code==='ua_unexpected'||code==='privacy_unverified')return 'identity';
  if(code==='no_name')return 'profile';
  return 'other';
}
function buildFleetTriage(profiles,reports,active=[],{limit=7}={}){
  if(!Array.isArray(profiles)||!Array.isArray(reports)||!Array.isArray(active)||
     !Number.isInteger(limit)||limit<1||limit>7)
    throw Error('Invalid fleet triage arguments');
  if(profiles.length>10000||reports.length>10000)
    throw Error('Fleet triage supports at most 10,000 profiles');
  const known=new Set(profiles.map(x=>x.id));
  const running=new Set(active.map(x=>x.profileId).filter(id=>known.has(id)));
  const seen=new Set();
  const rows=new Map();
  const stats={checked:0,ready:0,warning:0,error:0,unknown:0};
  for(const report of reports){
    if(!report||!known.has(report.profileId)||seen.has(report.profileId))continue;
    seen.add(report.profileId);
    stats.checked++;
    if(report.status==='ready')stats.ready++;
    else if(report.status==='warning')stats.warning++;
    else if(report.status==='error')stats.error++;
    else stats.unknown++;
    const perProfile=new Map();
    for(const issue of Array.isArray(report.issues)?report.issues:[]){
      if(!issue||!['error','warning'].includes(issue.level))continue;
      const code=groupFor(issue.code);
      const existing=perProfile.get(code);
      if(!existing||issue.level==='error')perProfile.set(code,issue.level);
    }
    for(const [code,severity] of perProfile){
      const current=rows.get(code)||{code,affected:0,blocking:0,review:0,activeAffected:0};
      current.affected++;
      if(severity==='error')current.blocking++;
      else current.review++;
      if(running.has(report.profileId))current.activeAffected++;
      rows.set(code,current);
    }
  }
  const items=[...rows.values()].map(item=>({
    ...item,
    title:ACTIONS[item.code].title,
    description:ACTIONS[item.code].description,
    action:ACTIONS[item.code].action,
    actionLabel:ACTIONS[item.code].label,
    severity:item.blocking?'error':'warning'
  })).sort((a,b)=>b.blocking-a.blocking||b.affected-a.affected||
      ACTIONS[a.code].priority-ACTIONS[b.code].priority).slice(0,limit);
  return {
    schema:'lhm.fleet.triage.v1',
    scope:'local_profile_configuration_issues_only',
    profileCount:profiles.length,
    activeCount:running.size,
    ...stats,
    unexamined:profiles.length-stats.checked,
    categoryCount:rows.size,
    items,
    recommendationsAreAutomated:false,
    mutations:0,
    networkRequests:0,
    limitations:'Các số liệu chỉ dựa vào Health Check cục bộ. Không đo độ tin cậy tài khoản Google/Meta, không xác minh DNS/WebRTC và không tự sửa profile.'
  };
}
module.exports={buildFleetTriage,groupFor,ACTIONS};
