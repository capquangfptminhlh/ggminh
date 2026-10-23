'use strict';

// Endpoint do người vận hành chọn. Không chứa credential/token trong URL.
function validateRuntimeEchoUrl(value) {
  if (typeof value !== 'string' || value.length > 2048)
    throw Error('Endpoint IP phải là URL HTTPS, tối đa 2048 ký tự.');
  const text = value.trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch (_) { throw Error('Endpoint IP không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw Error('Endpoint IP phải dùng HTTPS và không chứa tài khoản, mật khẩu, query hoặc fragment.');
  return url.href;
}
module.exports = { validateRuntimeEchoUrl };
