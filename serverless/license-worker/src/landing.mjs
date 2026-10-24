/* Public landing for browser.lhmcrm.com. Static and dependency-free.
 * Product introduction, not a SaaS browser or a commercial release claim.
 */
const page = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="LHM Ads Browser — quản lý hồ sơ trình duyệt, proxy và dữ liệu phiên độc lập trên Windows.">
  <title>LHM Ads Browser | LHMCRM</title>
  <style>
    *{box-sizing:border-box}
    html{min-height:100%;scroll-behavior:smooth}
    body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#24304b;background:linear-gradient(130deg,#f9f7f5 0%,#edf4fa 50%,#f6f8f8 100%);min-height:100vh}
    a{color:inherit}
    .shell{max-width:1130px;margin:auto;padding:30px 24px 75px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:16px}
    .brand{display:flex;gap:12px;align-items:center;font-size:18px;font-weight:800;letter-spacing:-.03em}
    .monogram{width:43px;height:43px;border-radius:15px;display:grid;place-items:center;background:#273f79;color:#fff;box-shadow:0 10px 30px #536c9538}
    .status{font-size:12px;font-weight:700;border:1px solid #cdd8e8;border-radius:999px;color:#526683;padding:8px 13px;background:#ffffffad}
    .hero{display:grid;grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr);gap:50px;align-items:center;padding:115px 0 95px}
    .eyebrow{font-size:12px;letter-spacing:.23em;font-weight:850;color:#6585a7}
    h1{line-height:1.1;letter-spacing:-.06em;font-size:clamp(42px,6vw,76px);margin:18px 0 24px;color:#1e3150}
    h1 span{color:#4774bb}
    .lead{max-width:540px;color:#64728a;font-size:18px;line-height:1.85;margin:0 0 30px}
    .notice{display:inline-flex;align-items:center;gap:9px;padding:10px 14px;border-radius:12px;background:#e6edf9;color:#305484;font-weight:700;font-size:13px}
    .notice:before{content:"";width:8px;height:8px;background:#739bcf;border-radius:50%;box-shadow:0 0 0 4px #739bcf28}
    .window{border:1px solid #e2e9f2;background:#f8faffee;border-radius:24px;box-shadow:18px 22px 55px #a6b5c955,-12px -12px 35px #fff;overflow:hidden}
    .chrome{display:flex;align-items:center;justify-content:space-between;background:#f1f5fc;border-bottom:1px solid #e5ecf4;padding:13px 20px}
    .dots{display:flex;gap:6px}.dots i{width:9px;height:9px;border-radius:50%;background:#c3d1e1}
    .chrome small{color:#7085a3;font-weight:750}
    .body{padding:24px}
    .body>strong{font-size:19px;letter-spacing:-.04em;color:#27426a}
    .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0}
    .mini{padding:17px 11px;border-radius:16px;background:#fff;border:1px solid #e4ebf4;box-shadow:3px 4px 12px #c6d2e42a}
    .mini strong{display:block;font-size:27px;color:#436fac;line-height:1.3}.mini span{font-size:10px;color:#7b8ba6}
    .rows{border:1px solid #e5ebf5;border-radius:16px;background:#fff;overflow:hidden}
    .rows div{display:flex;justify-content:space-between;gap:10px;padding:14px;border-bottom:1px solid #eff3f9;color:#536986;font-size:13px}
    .rows div:last-child{border:0}
    .rows b{color:#314f73}.pill{font-size:11px;padding:2px 9px;background:#e9f4ee;color:#39806b;border-radius:99px}
    .features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
    .feature{border-radius:22px;border:1px solid #e2eaf4;background:#ffffffa8;padding:26px;box-shadow:6px 10px 25px #b7c9db27}
    .feature b{display:block;font-size:17px;color:#2e4e79;margin:8px 0}
    .feature p{font-size:14px;color:#697d97;margin:0}
    .mark{font-size:28px;color:#7299c6;font-weight:800}
    footer{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #d8e2ee;margin-top:75px;padding-top:25px;font-size:13px;color:#8090a5}
    footer strong{color:#334d72}
    @media(max-width:820px){.hero{grid-template-columns:1fr;gap:35px;padding:80px 0 55px}.features{grid-template-columns:1fr}.shell{padding:18px 16px 50px}footer{flex-direction:column;align-items:flex-start}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>
</head>
<body>
  <main class="shell">
    <nav class="top" aria-label="LHM Ads Browser">
      <div class="brand"><div class="monogram" aria-hidden="true">L</div><span>LHM Ads Browser</span></div>
      <span class="status">Ứng dụng Windows</span>
    </nav>
    <div class="hero">
      <section>
        <div class="eyebrow">LHMCRM / BROWSER WORKSPACE</div>
        <h1>Quản lý hồ sơ.<br><span>Rõ ràng hơn.</span></h1>
        <p class="lead">Không gian quản lý các hồ sơ trình duyệt độc lập trên Windows, cấu hình proxy, theo dõi trạng thái và quản trị dữ liệu phiên.</p>
        <div class="notice">Đang hoàn thiện để phát hành thương mại</div>
      </section>
      <section class="window" aria-label="Minh họa các nhóm tính năng của sản phẩm">
        <div class="chrome"><div class="dots"><i></i><i></i><i></i></div><small>LHM Workspace</small></div>
        <div class="body">
          <strong>Browser Operations</strong>
          <div class="cards"><div class="mini"><strong>01</strong><span>Hồ sơ độc lập</span></div><div class="mini"><strong>02</strong><span>Proxy Center</span></div><div class="mini"><strong>03</strong><span>Kiểm tra cấu hình</span></div></div>
          <div class="rows">
            <div><b>Quản lý hồ sơ</b><span class="pill">Windows</span></div>
            <div><b>Danh mục fingerprint</b><span>Kiểm tra theo engine</span></div>
            <div><b>License theo kỳ hạn</b><span>Đang nghiệm thu</span></div>
          </div>
        </div>
      </section>
    </div>
    <section class="features" aria-label="Tính năng">
      <article class="feature"><div class="mark">01</div><b>Đa hồ sơ</b><p>Tách dữ liệu phiên làm việc, quản lý nhóm và trạng thái hồ sơ trong một giao diện.</p></article>
      <article class="feature"><div class="mark">02</div><b>Proxy & môi trường</b><p>Quản lý kết nối, xem cấu hình thiết bị và kiểm tra những tín hiệu chưa được đo.</p></article>
      <article class="feature"><div class="mark">03</div><b>Quản lý license</b><p>Định hướng cấp, gia hạn và thu hồi quyền sử dụng qua dịch vụ xác minh có chữ ký.</p></article>
    </section>
    <footer><strong>© LHM Ads Browser</strong><span>Phần mềm Windows. Trang này không phải bản chạy trong trình duyệt.</span></footer>
  </main>
</body>
</html>`;
export function renderLanding(request){
  const isHead=request.method==='HEAD';
  return new Response(isHead?null:page,{status:200,headers:{
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300',
    'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  }});
}
