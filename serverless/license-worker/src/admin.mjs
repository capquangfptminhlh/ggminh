/* Browser-only owner interface. No credentials embedded or persisted:
 * bearer supplied by operator stays in JS memory for this tab only.
 * The server authenticates every request and never trusts client payment text.
 */
const style=`
*{box-sizing:border-box}body{margin:0;font:14px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif;color:#26364e;background:#f5f7fb}
button,input,select{font:inherit}button{cursor:pointer}
header{background:#172e53;color:#fff;padding:16px clamp(18px,4vw,48px);display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
.logo{font-size:20px;font-weight:820;letter-spacing:-.03em}header small{color:#b6c9e6}
main{max-width:1360px;margin:auto;padding:28px clamp(16px,3vw,40px) 80px}
h1{font-size:28px;letter-spacing:-.035em;line-height:1.2;margin:0 0 8px}h2{font-size:18px;margin:0 0 15px;letter-spacing:-.015em}
p{color:#60718a}.muted{color:#62748b;font-size:12px}
.panel{border:1px solid #dfe5ef;border-radius:18px;background:#fff;box-shadow:0 8px 24px #1d3b6b0c;padding:22px;margin-bottom:20px}
#login{max-width:440px;margin:90px auto 0}#workspace[hidden],#login[hidden]{display:none}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0}
.stat{padding:20px;border-radius:16px;border:1px solid #dde6f2;background:#fff}
.stat strong{display:block;font-size:27px;letter-spacing:-.04em}.stat span{color:#70829a;font-size:12px}
label{display:flex;flex-direction:column;gap:5px;color:#4b5b70;font-size:12px;font-weight:700}
input,select{padding:11px 12px;border:1px solid #ccd7e6;background:#fff;border-radius:10px;min-width:0;width:100%;color:#203555}
input:focus,select:focus{outline:2px solid #91b7f0;outline-offset:1px}
fieldset{border:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
.button{display:inline-flex;justify-content:center;align-items:center;padding:11px 16px;border-radius:10px;border:0;background:#315c9e;color:#fff;font-weight:760;white-space:nowrap}
.button:hover{background:#21477f}.button.light{background:#e9eff8;color:#315587}.button.red{background:#fbe9e8;color:#973937}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px}
.table-wrap{overflow:auto;max-height:520px;border:1px solid #e3eaf4;border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:930px}
th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #edf1f8;vertical-align:middle;font-size:12px}
th{position:sticky;top:0;background:#f6f9fd;color:#64758c;font-weight:800}
td .button{padding:7px 11px;font-size:12px}
.code{font-family:ui-monospace,Consolas,monospace;word-break:break-all}
.tag{border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;background:#edf2fb;color:#486689}
.tag.pending{background:#fff1dd;color:#95610f}.tag.paid{background:#e8f2ff;color:#2260a1}.tag.fulfilled{background:#e5f5ed;color:#237149}
#feedback{min-height:24px;font-weight:750;margin:0 0 14px}
#feedback.error{color:#aa3434}#feedback.ok{color:#226d4a}
#keybox[hidden]{display:none}#keybox{background:#f0f5fc;border:1px solid #c2d6f1;border-radius:12px;padding:17px;margin:12px 0}
#licenseKey{height:90px;resize:vertical;width:100%;font:12px/1.4 ui-monospace,Consolas,monospace}
.notice{border-radius:12px;background:#f3f7fd;border:1px solid #d8e5f5;padding:11px 14px;color:#4e647e;font-size:13px;margin:13px 0}
@media(max-width:960px){.grid,.stats{grid-template-columns:repeat(2,minmax(0,1fr))}fieldset{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:570px){.grid,.stats,fieldset{grid-template-columns:1fr}.panel{padding:15px}main{padding:20px 12px 60px}#login{margin:40px auto}}
`;
const page=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LHM Ads Browser — Quản trị License</title><meta name="robots" content="noindex,nofollow">
<style>${style}</style><script src="/admin/app.js" defer></script></head><body>
<header><div class="logo">LHM <span style="font-weight:400">/ Browser License</span></div><small>Quản trị nội bộ · Cloudflare D1</small></header>
<main><section class="panel" id="login"><h1>Đăng nhập quản trị</h1>
<p>Dùng khóa quản trị được lưu an toàn trong Cloudflare Secrets. Khóa chỉ ở bộ nhớ tab này, không lưu trong trình duyệt.</p>
<form id="loginForm"><label>Khóa quản trị<input id="adminToken" type="password" autocomplete="off" required minlength="32" placeholder="LHM_LICENSE_ADMIN_TOKEN"></label>
<div class="actions"><button class="button" type="submit">Truy cập bảng điều khiển</button></div></form>
<p class="muted">Nên bổ sung Cloudflare Access/WAF trước khi cho website hoạt động công khai.</p></section>
<section id="workspace" hidden>
<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><h1>Quản lý khách hàng &amp; license</h1><p>Tạo đơn hàng, kiểm tra chuyển khoản, cấp key và gia hạn theo kỳ.</p></div>
<button class="button light" id="logout" type="button">Đăng xuất</button></div>
<div class="stats"><div class="stat"><strong id="customerCount">0</strong><span>Khách hàng</span></div><div class="stat"><strong id="orderCount">0</strong><span>Đơn hàng</span></div><div class="stat"><strong id="pendingCount">0</strong><span>Chờ thanh toán</span></div><div class="stat"><strong id="paidCount">0</strong><span>Đã xác nhận / chờ cấp key</span></div></div>
<div id="feedback" role="status" aria-live="polite"></div>
<div id="keybox" hidden><h2>Key đã ký — sao chép gửi cho khách</h2>
<p class="muted">Không gửi key trước khi xác minh thanh toán. Key hiện ở đây để sao chép, không lưu trong localStorage.</p>
<textarea id="licenseKey" readonly spellcheck="false" aria-label="Key phần mềm"></textarea>
<div class="actions"><button type="button" id="copyKey" class="button">Sao chép key</button><button type="button" id="closeKey" class="button light">Ẩn key</button></div></div>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
<div class="panel"><h2>Thêm khách hàng</h2><form id="customerForm">
<fieldset style="grid-template-columns:1fr"><label>Tên khách hàng<input required id="customerName" maxlength="120" placeholder="Nguyễn Văn A"></label>
<label>Email<input required id="customerEmail" type="email" maxlength="190" placeholder="khach@example.com"></label></fieldset>
<div class="actions"><button class="button" type="submit">Lưu khách hàng</button></div></form></div>
<div class="panel"><h2>Tạo đơn hàng</h2><form id="orderForm"><fieldset>
<label>Khách hàng<select id="orderCustomer" required></select></label>
<label>Loại đơn<select id="orderKind"><option value="new">Cấp mới</option><option value="renew">Gia hạn</option></select></label>
<label>Mã key cũ (gia hạn)<input id="priorLicense" class="code" placeholder="lic_..." autocomplete="off"></label>
<label>Mã cài đặt Windows<input id="installationId" class="code" required placeholder="UUID từ phần mềm"></label>
<label>Gói<select id="orderPlan"><option value="starter">Starter</option><option value="pro">Pro</option><option value="business">Business</option></select></label>
<label>Thời hạn<select id="orderMonths"><option value="1">1 tháng</option><option value="3">3 tháng</option><option value="6">6 tháng</option><option value="12">12 tháng</option></select></label>
<label>Số Profile tối đa<input id="maxProfiles" type="number" min="1" max="10000" value="5" required></label>
<label>Giá cần thu (VND)<input id="amountVnd" type="number" min="1" max="1000000000" placeholder="Nhập giá đã thỏa thuận" required></label>
<label>Quyền tính năng<select id="featurePreset"><option value="profiles">Profiles</option><option value="api,profiles">Profiles + API</option><option value="api,automation,profiles">Profiles + API + Automation</option><option value="api,automation,profiles,team">Tất cả</option></select></label>
</fieldset><div class="actions"><button class="button" type="submit">Tạo đơn chờ thanh toán</button></div></form></div></div>
<section class="panel"><h2>Danh sách đơn hàng</h2><p class="notice">Thanh toán hiện được <b>xác nhận thủ công</b>. Chỉ nhấn “Xác nhận đã nhận tiền” sau khi kiểm tra giao dịch thực tế trong tài khoản ngân hàng. Không có thanh toán tự động hoặc webhook ngân hàng ở phiên bản này.</p>
<div class="actions"><button class="button light" id="refresh" type="button">Làm mới</button></div>
<div class="table-wrap"><table><thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Gói / loại</th><th>Giá</th><th>Thanh toán</th><th>License</th><th>Thao tác</th></tr></thead><tbody id="orderRows"></tbody></table></div>
</section>
</section></main></body></html>`;
export function adminHtml(req){
 return new Response(req.method==='HEAD'?null:page,{status:200,headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer'
 }});
}
