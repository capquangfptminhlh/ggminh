#!/usr/bin/env node
'use strict';
// Private, read-only offline HTML for vendor operators. NO external assets,
// scripts, token contents, cookies or signing keys.
const fs=require('fs'),path=require('path');
const {readLedger}=require('../src/licensing/customerLedger');
function escape(text){
 return String(text).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
}
function htmlReport(ledger,{now=Date.now(),days=14}={}){
 if(!Number.isFinite(now)||!Number.isInteger(days)||days<0||days>365)
  throw Error('Invalid dashboard report period');
 const customerMap=new Map(ledger.customers.map(x=>[x.id,x]));
 const newer=new Set(ledger.licenses.map(x=>x.renewalOf).filter(Boolean));
 const rows=ledger.licenses.map(x=>{
  const expired=Date.parse(x.expiresAt)<=now;
  const superseded=newer.has(x.licenseId);
  const status=x.revoked?'Đã thu hồi':expired?'Hết hạn':superseded?'Đã gia hạn':'Đang hoạt động';
  return {...x,customer:customerMap.get(x.customerId)?.name||'Unknown',status,
   isDue:!x.revoked&&!expired&&!superseded&&Date.parse(x.expiresAt)<=now+days*86400000};
 });
 const current=rows.filter(x=>x.status==='Đang hoạt động');
 const expiring=rows.filter(x=>x.isDue).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt));
 const stats=[
  {label:'Khách hàng',value:ledger.customers.length},
  {label:'License còn hiệu lực',value:current.length},
  {label:'Sắp hết hạn ('+days+' ngày)',value:expiring.length},
  {label:'License đã thu hồi',value:rows.filter(x=>x.revoked).length}
 ];
 const cards=stats.map(s=>'<article class="metric"><span>'+escape(s.label)+
  '</span><strong>'+escape(s.value)+'</strong></article>').join('');
 const tr=(x)=>'<tr><td><strong>'+escape(x.customer)+'</strong><small>'+
  escape(x.customerId)+'</small></td><td><code>'+escape(x.licenseId)+'</code></td>'+
  '<td>'+escape(x.plan)+'</td><td>'+escape(x.maxProfiles)+'</td>'+
  '<td>'+escape(x.expiresAt.slice(0,10))+'</td><td>'+escape(x.status)+'</td></tr>';
 const table=items=>items.length?items.map(tr).join(''):
  '<tr><td colspan="6" class="empty">Không có bản ghi phù hợp.</td></tr>';
 const content='<!doctype html>\n<html lang="vi"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
  '<title>LHM · Quản trị thuê bao (offline)</title>'+
  '<style>'+
  ':root{color-scheme:dark;font:14px system-ui,Segoe UI,sans-serif;background:#0c1220;color:#e4ebf7}'+
  'body{max-width:1200px;margin:auto;padding:32px 22px}h1{font-size:28px;margin:8px 0;color:#fff}'+
  'h2{font-size:17px;margin:30px 0 12px}p,small,.muted{color:#9aaccc}'+
  '.tag{display:inline-block;color:#acd4ff;border:1px solid #2b4d6f;border-radius:99px;padding:6px 12px}'+
  '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:24px}'+
  '.metric{background:#172337;border:1px solid #2d3d55;border-radius:14px;padding:22px;display:grid;gap:10px}'+
  '.metric span{color:#a6b6d0}.metric strong{font-size:30px}'+
  'table{width:100%;border-collapse:collapse;background:#141e30;border-radius:12px;overflow:hidden}'+
  'th{text-align:left;background:#1e2c44;color:#b6c5dc;font-size:12px;font-weight:600}'+
  'th,td{padding:13px 14px;border-bottom:1px solid #27354d;vertical-align:top}'+
  'td small{display:block;font-size:11px;margin-top:6px}code{color:#a7d9fc;overflow-wrap:anywhere}'+
  'footer{padding:26px 0;font-size:12px;color:#91a0b9}'+
  '@media(max-width:760px){.metrics{grid-template-columns:repeat(2,1fr)}.scroll{overflow:auto}table{min-width:760px}}'+
  '</style></head><body><span class="tag">BÁO CÁO RIÊNG TƯ · OFFLINE · CHỈ ĐỌC</span>'+
  '<h1>LHM Subscription Center</h1><p>Sổ khách hàng và thuê bao. Tạo lúc '+
  escape(new Date(now).toISOString().replace('T',' ').slice(0,19))+' UTC. '+
  'Báo cáo chứa tên khách và mã license; không đăng lên website công khai.</p>'+
  '<section class="metrics">'+cards+'</section>'+
  '<h2>License sắp hết hạn</h2><div class="scroll"><table><thead><tr>'+
  '<th>Khách hàng</th><th>Mã license</th><th>Gói</th><th>Profile</th><th>Ngày hết hạn</th><th>Trạng thái</th>'+
  '</tr></thead><tbody>'+table(expiring)+'</tbody></table></div>'+
  '<h2>Tất cả license</h2><div class="scroll"><table><thead><tr>'+
  '<th>Khách hàng</th><th>Mã license</th><th>Gói</th><th>Profile</th><th>Ngày hết hạn</th><th>Trạng thái</th>'+
  '</tr></thead><tbody>'+table(rows.slice().sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)))+
  '</tbody></table></div>'+
  '<footer>Không có JS, kết nối mạng, chức năng thanh toán hay nút cấp quyền. '+
  'Thay đổi license bằng lệnh quản trị được phép trên máy chủ nội bộ.</footer>'+
  '</body></html>';
 return content;
}
function generate(ledgerFile,output,{now=Date.now(),days=14}={}){
 if(typeof ledgerFile!=='string'||!path.isAbsolute(ledgerFile)||
    typeof output!=='string'||!path.isAbsolute(output)||path.extname(output).toLowerCase()!=='.html')
  throw Error('Use absolute private ledger and HTML report paths');
 const data=readLedger(ledgerFile);
 const html=htmlReport(data,{now,days});
 fs.writeFileSync(output,html,{flag:'wx',mode:0o600});
 return {created:true,path:output,bytes:Buffer.byteLength(html)};
}
if(require.main===module){
 try{
  if(process.argv.length<4||process.argv.length>5)
   throw Error('Usage: node tools/license-dashboard.js LEDGER /private/report.html [DAYS]');
  const output=generate(process.argv[2],process.argv[3],{
   days:process.argv[4]===undefined?14:Number(process.argv[4])
  });
  console.log(JSON.stringify(output));
 }catch(error){console.error('Admin dashboard:',error.message);process.exitCode=1;}
}
module.exports={generate,htmlReport,escape};
