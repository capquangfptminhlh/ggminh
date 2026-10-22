'use strict';
/**
 * LHM Ads Launch Guard: offline pre-publication URL/UTM hygiene only.
 *
 * Deliberately no HTTP requests, cookies, fingerprint data, platform tokens,
 * account login or persistence. Results omit query values and fragments.
 * "PASS" never means a live destination works or will convert.
 */
const net = require('node:net');
const MAX_URLS = 20;
const MAX_INPUT = 32000;
const UTM = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign']);
const SENSITIVE_NAME = /(?:^|[_-])(?:password|passwd|secret|token|access_token|refresh_token|session|sid|apikey|api_key|authorization|auth|email|e_mail|phone|tel|mobile|address|jwt|bearer|creditcard|card_number)(?:$|[_-])/i;

function isLocalAddress(host) {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (value === 'localhost' || value.endsWith('.localhost') ||
      value.endsWith('.local') || value.endsWith('.internal') || value.endsWith('.test')) return true;
  const family = net.isIP(value);
  if (family === 4) {
    const [a,b,c] = value.split('.').map(Number);
    return a===0 || a===10 || a===127 || a>=224 ||
      (a===169 && b===254) || (a===172 && b>=16 && b<=31) ||
      (a===192 && b===168) || (a===100 && b>=64 && b<=127) ||
      (a===192 && b===0 && c===2) || (a===198 && b===51 && c===100) ||
      (a===203 && b===0 && c===113);
  }
  return family === 6 && (value === '::1' || value === '::' ||
    /^f[cd]/i.test(value) || /^fe[89ab]/i.test(value) ||
    /^ff/i.test(value));
}
function inspectOne(value, index) {
  const findings = [];
  const add = (level, code, message) => {
    if (!findings.some(x => x.code === code))
      findings.push({level, code, message});
  };
  const text = typeof value === 'string' ? value.trim() : '';
  const result = {index, destination:'Không xác định', scheme:null, status:'blocked',
    findings, inspectedOffline:true, httpChecked:false, redirectsChecked:false};
  if (!text || text.length > 4096 || /[\u0000-\u001f\u007f]/.test(text)) {
    add('error','invalid_input','URL trống, quá dài hoặc chứa ký tự điều khiển.');
    return result;
  }
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    add('error','invalid_url','Địa chỉ URL không hợp lệ.');
    return result;
  }
  if (!['https:','http:'].includes(url.protocol)) {
    add('error','protocol_unsupported','Chỉ nhận địa chỉ http:// hoặc https://.');
    return result;
  }
  if (!url.hostname || url.username || url.password) {
    add('error','url_credentials','URL không được chứa tài khoản hoặc mật khẩu.');
  }
  if (isLocalAddress(url.hostname)) {
    add('error','non_public_destination','Link trỏ tới địa chỉ nội bộ/thử nghiệm hoặc không công khai.');
  }
  if (url.protocol !== 'https:') {
    add('warning','unencrypted_destination','Đích dùng HTTP; nên xác minh và ưu tiên HTTPS.');
  }
  if (url.hash) {
    add('notice','fragment_present','URL có #fragment. Phần này không được gửi tới máy chủ HTTP.');
  }
  const keys = new Map();
  let paramCount=0;
  for (const [key,value] of url.searchParams) {
    paramCount++;
    const lower = key.toLowerCase();
    keys.set(lower,(keys.get(lower)||0)+1);
    if (!key || key.length > 80) add('warning','query_key_invalid','Có tên tham số truy vấn trống hoặc quá dài.');
    if (SENSITIVE_NAME.test(lower)) {
      add('error','sensitive_query_key',
        'URL chứa tên tham số có thể mang dữ liệu cá nhân, phiên đăng nhập hoặc khóa bí mật. Hãy loại bỏ dữ liệu nhạy cảm.');
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
        /\b(?:bearer\s+|sk-[A-Za-z0-9_-]{12,})/i.test(value)) {
      add('error','sensitive_query_value',
        'URL có giá trị trông giống email hoặc khóa truy cập. Không đưa dữ liệu riêng tư vào quảng cáo.');
    }
  }
  if (paramCount > 40) add('warning','too_many_parameters','Link có hơn 40 tham số; hãy rà lại tracking và độ dài URL.');
  for (const [key,count] of keys) {
    if (count > 1 && (key.startsWith('utm_') || key==='gclid' ||
        key==='fbclid' || key==='msclkid')) {
      add('warning','duplicate_tracking','Có tham số UTM/click-ID bị lặp. Báo cáo đo lường có thể không nhất quán.');
      break;
    }
  }
  const present = UTM.filter(k=>keys.has(k));
  if (present.length && present.length!==UTM.length)
    add('warning','utm_incomplete','UTM đang dùng nhưng thiếu utm_source, utm_medium hoặc utm_campaign.');
  for (const key of UTM) {
    if (keys.has(key) && url.searchParams.getAll(key)
      .some(v=>!v.trim() || v.trim()!==v)) {
      add('warning','utm_value_invalid','Giá trị UTM trống hoặc có khoảng trắng ở đầu/cuối.');
      break;
    }
  }
  if (!present.length) add('notice','utm_optional',
    'Chưa gắn UTM. Có thể dùng auto-tagging; kiểm tra cấu hình đo lường Google Ads/Meta và GA4 trước khi quyết định.');
  result.destination = url.origin + url.pathname; // Do not copy query, fragment or secret values into reports.
  result.scheme = url.protocol.slice(0,-1);
  const errors=findings.filter(x=>x.level==='error').length;
  const warnings=findings.filter(x=>x.level==='warning').length;
  result.status=errors?'blocked':warnings?'review':'ready';
  result.errors=errors;
  result.warnings=warnings;
  return result;
}
function inspectLandingUrls(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_INPUT)
    throw Error('Nhập 1–20 URL, tổng tối đa 32.000 ký tự.');
  const lines = input.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (!lines.length || lines.length > MAX_URLS)
    throw Error('Nhập tối đa 20 URL, mỗi dòng một địa chỉ.');
  const items=lines.map((line,i)=>inspectOne(line,i+1));
  return {
    scope:'offline_url_and_utm_hygiene_only',
    checked:items.length,
    blocked:items.filter(x=>x.status==='blocked').length,
    review:items.filter(x=>x.status==='review').length,
    ready:items.filter(x=>x.status==='ready').length,
    items,
    networkRequests:0,
    conversionTrackingVerified:false,
    note:'Chưa đo HTTP status, redirect, pixel, GA4, Meta Pixel, GTM, sự kiện chuyển đổi hoặc chính sách nền tảng. Không kết luận chiến dịch đã sẵn sàng phát hành.'
  };
}
const UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
function buildUtmUrl(base, values) {
  if (typeof base !== 'string' || base.length > 4096 ||
      !values || typeof values!=='object' || Array.isArray(values))
    throw Error('Link gốc hoặc cấu hình UTM không hợp lệ.');
  let url;
  try {url=new URL(base.trim());}
  catch (_) {throw Error('Link gốc không hợp lệ.');}
  if (!['http:','https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || isLocalAddress(url.hostname))
    throw Error('Chỉ tạo UTM cho link HTTP(S) công khai, không chứa thông tin đăng nhập.');
  const source=Object.create(null);
  for (const key of UTM_KEYS) {
    const val=values[key];
    if (val !== undefined && val !== null && typeof val!=='string')
      throw Error('Thông số UTM phải là chuỗi.');
    source[key]=(val||'').trim();
    if (source[key].length > 100 || /[\u0000-\u001f\u007f]/.test(source[key]))
      throw Error('Giá trị UTM quá dài hoặc không hợp lệ.');
  }
  if (UTM.some(key=>!source[key])) throw Error('Cần đủ utm_source, utm_medium và utm_campaign.');
  // User explicitly asked to build a NEW URL. Replace only UTM keys; keep
  // unrelated advertiser query params and click IDs unchanged.
  for(const [key] of [...url.searchParams]) if(key.toLowerCase().startsWith('utm_'))
    url.searchParams.delete(key);
  for(const key of UTM_KEYS) if(source[key]) url.searchParams.set(key,source[key]);
  if(url.toString().length>4096)throw Error('URL sau khi thêm UTM quá dài.');
  const safety=inspectOne(url.toString(),1);
  if(safety.errors)throw Error('Link có tham số nhạy cảm hoặc địa chỉ không hợp lệ; hãy sửa trước khi tạo UTM.');
  return {url:url.toString(),status:safety.status,findings:safety.findings};
}
module.exports={inspectLandingUrls,inspectOne,buildUtmUrl,isLocalAddress,MAX_URLS};
