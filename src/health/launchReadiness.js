'use strict';
/**
 * LHM Launch Readiness: offline, non-invasive safety assessment.
 *
 * An affirmative result only means known LOCAL CONFIGURATION errors were not
 * found. It cannot prove remote-platform identity, anonymity, IP route,
 * DNS/WebRTC behavior or account outcomes.
 */
const { checkProfileSignalChain } = require('./signalChain');
const { safeWebUrls } = require('../engine/launchArgs');

function launchReadiness(profile, { proxies = [], vault = null } = {}) {
  const issues = [];
  const add = (level, code, message) => {
    if (!issues.some(item => item.code === code))
      issues.push({ level, code, message });
  };
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    add('error', 'profile_invalid', 'Hồ sơ không hợp lệ.');
    return makeReport(null, issues);
  }
  const signal = checkProfileSignalChain(profile);
  for (const issue of signal.issues)
    add(issue.level, 'signal_' + issue.code, issue.message);
  if (profile.requiresProxySetup === true)
    add('error', 'proxy_setup_required', 'Hồ sơ cần gán proxy lại trong Proxy Center trước khi mở.');
  const urls = Array.isArray(profile.startUrls) && profile.startUrls.length ?
    profile.startUrls : [profile.startUrl || 'https://ads.google.com/'];
  try { safeWebUrls(urls); }
  catch (_) { add('error', 'start_urls_invalid', 'URL khởi chạy phải là 1–5 địa chỉ HTTP(S) hợp lệ, không chứa thông tin đăng nhập.'); }

  const proxy = profile.proxy || { type: 'direct' };
  if (proxy.authProxyId) {
    const entry = Array.isArray(proxies) ? proxies.find(item => item.id === proxy.authProxyId) : null;
    if (!entry || entry.type !== proxy.type || entry.host !== proxy.host ||
        Number(entry.port) !== Number(proxy.port))
      add('error', 'proxy_reference_missing', 'Proxy có mật khẩu không còn khớp với Proxy Center. Cần gán lại.');
    if (!vault || typeof vault.available !== 'function' ||
        typeof vault.has !== 'function') {
      add('error', 'proxy_vault_unavailable', 'Không thể xác minh kho mật khẩu proxy cục bộ.');
    } else {
      try {
        if (!vault.available())
          add('error', 'proxy_vault_unavailable', 'Kho mật khẩu proxy mã hóa chưa khả dụng.');
        else if (!vault.has(proxy.authProxyId))
          add('error', 'proxy_password_missing', 'Không tìm thấy thông tin xác thực của proxy.');
      } catch (_) {
        add('error', 'proxy_vault_unavailable', 'Không thể kiểm tra kho mật khẩu proxy.');
      }
    }
  }
  if (proxy.type && proxy.type !== 'direct')
    add('warning', 'network_unverified',
      'Cấu hình proxy không chứng minh được IP thoát, DNS, WebRTC hoặc đường truyền thực tế.');
  else
    add('warning', 'direct_connection',
      'Đang sử dụng kết nối trực tiếp; không có bằng chứng về cách ly IP mạng.');
  add('warning', 'remote_detection_unknown',
    'Không thể xác định hay bảo đảm Google, Meta hoặc website khác sẽ coi đây là người dùng mới.');
  return makeReport(profile.id || null, issues);
}

function makeReport(profileId, issues) {
  const errorCount = issues.filter(x => x.level === 'error').length;
  const warningCount = issues.filter(x => x.level === 'warning').length;
  return {
    profileId, status: errorCount ? 'blocked' : warningCount ? 'review' : 'ready',
    canLaunch: errorCount === 0, errorCount, warningCount, issues,
    assessedScope: 'local_configuration_only',
    measuredNetwork: false,
    detectedAsNewUser: 'NOT_MEASURED',
    note: 'Chỉ kiểm tra cấu hình trước khi khởi chạy. Không xác nhận ẩn danh, không vượt kiểm tra chống gian lận.'
  };
}
module.exports = { launchReadiness };
