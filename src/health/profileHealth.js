const net = require('net');
const fs = require('fs');
const { optionsFor } = require('../engine/browserDiagnostics');

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
  if (!executable.filter(Boolean).some(pathExists)) issues.push({ level: 'error', code: 'browser_missing', message: 'Không tìm thấy chương trình trình duyệt phù hợp trên máy này.' });
  if (!name.trim()) issues.push({ level: 'error', code: 'no_name', message: 'Hồ sơ chưa có tên.' });
  try {
    const url = new URL(profile.startUrl || 'https://ads.google.com/');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('URL không hợp lệ');
  } catch (_) { issues.push({ level: 'error', code: 'invalid_starturl', message: 'URL trang mặc định không hợp lệ.' }); }
  const config = validateProxy(proxy);
  if (!config.ok) issues.push({ level: 'error', code: 'proxy_invalid', message: config.message });
  if (engine === 'gecko' && config.ok && config.type !== 'direct') issues.push({
    level: 'notice', code: 'gecko_proxy_profile', message: 'HTTP/SOCKS5 sẽ áp dụng bằng Firefox user.js khi mở hồ sơ. Chưa hỗ trợ proxy xác thực.'
  });
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
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  return {
    profileId: profile?.id || null, engine,
    status: errors ? 'error' : warnings ? 'warning' : 'ready',
    errorCount: errors, warningCount: warnings, issues,
    note: 'Health Check chỉ xác nhận khả năng cấu hình; không đo khả năng Google nhận diện.'
  };
}

function validateProxy(input) {
  if (!input || input.type === 'direct' || input.type === 'none' || !input.type) return { ok: true, type: 'direct' };
  const type = String(input.type).toLowerCase();
  if (!['http','socks5'].includes(type)) return { ok: false, type, message: 'Chỉ hỗ trợ HTTP hoặc SOCKS5.' };
  if (input.user || input.pass || input.password) return { ok: false, type, message: 'Proxy có tài khoản/mật khẩu chưa được hỗ trợ trong trình duyệt.' };
  const host = String(input.host || '');
  const port = Number(input.port);
  if (!host || host.length > 253 || /\s|\/|@/.test(host) || (!net.isIP(host) && !/^[a-z0-9.-]+$/i.test(host))) {
    return { ok: false, type, message: 'Địa chỉ proxy không hợp lệ.' };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, type, message: 'Cổng proxy phải từ 1 đến 65535.' };
  return { ok: true, type, host, port };
}
module.exports = { checkProfile, validateProxy };
