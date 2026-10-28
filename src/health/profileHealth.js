const {validateProxy}=require('./proxyValidation');
const fs = require('fs');
const { optionsFor, msixFirefoxPath, isWindowsAppsPath, MSIX_FIREFOX_MESSAGE } = require('../engine/browserDiagnostics');
const {checkProfileSignalChain}=require('./signalChain');

function checkProfile(profile, options = {}) {
  const issues = [];
  const name = typeof profile?.name === 'string' ? profile.name : '';
  const engine = profile?.engine === 'gecko' ? 'gecko' : 'chromium';
  const proxy = profile?.proxy || { type: 'direct' };
  const settings = options.settings || {};
  const pathExists = options.pathExists || fs.existsSync;
  const engines = optionsFor(settings);
  const executable = engine === 'gecko'
    ? engines.find(x => x.id === 'firefox').candidates
    : [...engines.find(x => x.id === 'chrome').candidates,
       ...engines.find(x => x.id === 'edge').candidates];
  if (!executable.filter(Boolean).some(p => !isWindowsAppsPath(p) && pathExists(p))) issues.push({ level: 'error', code: 'browser_missing',
    message: engine === 'gecko' && msixFirefoxPath(settings, options.msixProbe) ? MSIX_FIREFOX_MESSAGE :
      'Không tìm thấy chương trình trình duyệt phù hợp trên máy này.' });
  if (!name.trim()) issues.push({ level: 'error', code: 'no_name', message: 'Hồ sơ chưa có tên.' });
  try {
    const url = new URL(profile.startUrl || 'https://ads.google.com/');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('URL không hợp lệ');
  } catch (_) { issues.push({ level: 'error', code: 'invalid_starturl', message: 'URL trang mặc định không hợp lệ.' }); }
  if(profile?.requiresProxySetup===true) issues.push({
    level:'error',code:'proxy_setup_required',
    message:'Hồ sơ nhập từ bản sao lưu cần gán lại proxy trong Proxy Center trước khi mở.'
  });
  const config = validateProxy(proxy);
  if (!config.ok) issues.push({ level: 'error', code: 'proxy_invalid', message: config.message });
  if (engine === 'gecko' && config.ok && config.type !== 'direct') issues.push({
    level: 'notice', code: 'gecko_proxy_profile', message: 'HTTP/SOCKS5 sẽ áp dụng bằng Firefox user.js. Proxy có mật khẩu dùng kết nối chuyển tiếp cục bộ.'
  });
  if (proxy.authProxyId) {
    const entry = (options.proxies || []).find(p=>p.id===proxy.authProxyId);
    if (options.proxies && (!entry || entry.type!==proxy.type ||
        entry.host!==proxy.host || Number(entry.port)!==Number(proxy.port))) {
      issues.push({level:'error',code:'proxy_credential_mismatch',
        message:'Cấu hình proxy xác thực không còn khớp với kho proxy. Hãy gán lại.'});
    }
    if(options.vault) {
      if(!options.vault.has(proxy.authProxyId)) issues.push({
        level:'error',code:'proxy_credential_missing',
        message:'Thiếu mật khẩu proxy. Hãy nhập lại trong Proxy Center.'
      });
      else if(!options.vault.available()) issues.push({
        level:'error',code:'proxy_encryption_unavailable',
        message:'Mã hóa mật khẩu Windows đang không khả dụng.'
      });
      else issues.push({level:'notice',code:'proxy_authenticated',
        message:'Proxy xác thực sử dụng kho mật khẩu mã hóa và gateway HTTPS CONNECT trên máy.'});
    }
  }
  if (engine === 'gecko') issues.push({
    level: 'notice', code: 'gecko_experimental', message: 'Gecko cần Firefox cài ngoài; RPA/CDP và cấu hình mặt nạ Chromium không có hiệu lực.'
  });
  const fp = profile?.fingerprint || {};
  if (engine === 'chromium' && fp.userAgent && !/Chrome\/\d+/.test(fp.userAgent)) issues.push({
    level: 'warning', code: 'ua_unexpected', message: 'User-Agent tùy chỉnh không có định dạng Chrome thông thường. Hãy kiểm tra tính tương thích.'
  });
  if (engine === 'chromium' && fp.userAgent && /Chrome\/(12[0-9]|13[0-9])\./.test(fp.userAgent)) issues.push({
    level: 'warning', code: 'ua_outdated', message: 'User-Agent có thể đã cũ; nên dùng giá trị trình duyệt thực tế, không giả mạo phiên bản.'
  });
  if (engine === 'chromium' && fp.mode !== 'native') issues.push({
    level: 'notice', code: 'privacy_unverified', message: 'Cơ chế Canvas/WebGL/WebRTC hiện chưa được kiểm thử xuyên phiên bản; không bảo đảm ẩn danh.'
  });
  // Offline coherence check. Do not report proxy UDP safety without packet proof.
  const audit=checkProfileSignalChain(profile);
  for(const issue of audit.issues)
    issues.push({level:issue.level,code:'signal_'+issue.code,message:issue.message});
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  return {
    profileId: profile?.id || null, engine,
    status: errors ? 'error' : warnings ? 'warning' : 'ready',
    errorCount: errors, warningCount: warnings, issues, signalChain:audit,
    note: 'Health Check chỉ xác nhận khả năng cấu hình; không đo khả năng Google nhận diện.'
  };
}

module.exports = { checkProfile, validateProxy };
