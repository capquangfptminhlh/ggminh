'use strict';
const net=require('net');
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
module.exports={validateProxy};
