const net = require('net');
const tls = require('tls');
const https = require('https');
const { validateProxy } = require('../health/profileHealth');

const IP_HOST = 'api.ipify.org';
const TIMEOUT_MS = 9000;

function parseRemoteIp(raw) {
  const text = String(raw);
  if (!/^HTTP\/1\.[01] 200(?:\s|\r|\n)/.test(text)) throw Error('Dịch vụ xác nhận IP trả về lỗi');
  const match = text.match(/"ip"\s*:\s*"([^"]+)"/);
  if (!match || !net.isIP(match[1])) throw Error('Dữ liệu IP trả về không hợp lệ');
  return match[1];
}

class Reader {
  constructor(socket) {
    this.socket = socket;
    this.data = Buffer.alloc(0);
    this.pending = [];
    this.error = null;
    this.onData = value => { this.data = Buffer.concat([this.data, value]); this.signal(); };
    this.onError = error => { this.error = error; this.signal(); };
    this.onEnd = () => { this.error = new Error('Kết nối proxy đóng sớm'); this.signal(); };
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onEnd);
  }
  signal() { for (const resolve of this.pending.splice(0)) resolve(); }
  async wait() {
    if (this.error) throw this.error;
    await new Promise(resolve => this.pending.push(resolve));
    if (this.error) throw this.error;
  }
  async read(n) {
    while (this.data.length < n) await this.wait();
    const data = this.data.subarray(0, n); this.data = this.data.subarray(n);
    return data;
  }
  async until(marker, limit = 8192) {
    const delimiter = Buffer.from(marker);
    while (true) {
      const end = this.data.indexOf(delimiter);
      if (end >= 0) {
        const value = this.data.subarray(0, end + delimiter.length);
        this.data = this.data.subarray(end + delimiter.length);
        return value;
      }
      if (this.data.length > limit) throw Error('Phản hồi proxy quá dài');
      await this.wait();
    }
  }
  close() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onEnd);
  }
}

async function viaProxy(proxy) {
  const socket = net.createConnection({ host: proxy.host, port: proxy.port });
  socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('Proxy không phản hồi đúng hạn')));
  const reader = new Reader(socket);
  try {
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    if (proxy.type === 'http') {
      socket.write('CONNECT ' + IP_HOST + ':443 HTTP/1.1\r\nHost: ' + IP_HOST + ':443\r\nProxy-Connection: keep-alive\r\n\r\n');
      const response = (await reader.until('\r\n\r\n')).toString('latin1');
      if (!/^HTTP\/1\.[01] 200(?:\s|\r|\n)/.test(response)) throw Error('HTTP proxy từ chối CONNECT hoặc yêu cầu xác thực');
    } else if (proxy.type === 'socks5') {
      socket.write(Buffer.from([5, 1, 0]));
      const greeting = await reader.read(2);
      if (greeting[0] !== 5 || greeting[1] !== 0) throw Error('SOCKS5 từ chối phương thức không mật khẩu');
      const domain = Buffer.from(IP_HOST);
      socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, domain.length]), domain, Buffer.from([1, 187])]));
      const reply = await reader.read(4);
      if (reply[0] !== 5 || reply[1] !== 0) throw Error('SOCKS5 không thể kết nối tới dịch vụ xác nhận IP');
      if (reply[3] === 1) await reader.read(4);
      else if (reply[3] === 3) await reader.read((await reader.read(1))[0]);
      else if (reply[3] === 4) await reader.read(16);
      else throw Error('SOCKS5 trả về loại địa chỉ lạ');
      await reader.read(2);
    } else throw Error('Loại proxy không hỗ trợ');
    reader.close();
    if (reader.data.length) throw Error('Dữ liệu proxy không mong đợi khi bắt đầu TLS');
    const secured = tls.connect({ socket, servername: IP_HOST, rejectUnauthorized: true });
    await new Promise((resolve, reject) => {
      secured.once('secureConnect', resolve);
      secured.once('error', reject);
    });
    secured.setTimeout(TIMEOUT_MS, () => secured.destroy(new Error('Hết hạn kiểm tra IP')));
    return await new Promise((resolve, reject) => {
      let data = '';
      secured.on('data', part => {
        data += part.toString('utf8');
        if (data.length > 32768) secured.destroy(Error('Phản hồi IP quá lớn'));
      });
      secured.once('error', reject);
      secured.once('end', () => {
        try { resolve(parseRemoteIp(data)); } catch (error) { reject(error); }
      });
      secured.write('GET /?format=json HTTP/1.1\r\nHost: ' + IP_HOST + '\r\nAccept: application/json\r\nConnection: close\r\n\r\n');
    });
  } finally {
    reader.close();
    socket.destroy();
  }
}

function directIp() {
  return new Promise((resolve, reject) => {
    const request = https.get('https://' + IP_HOST + '/?format=json', {
      headers: { 'User-Agent': 'LHM-Proxy-Diagnostics/1.0' },
      timeout: TIMEOUT_MS
    }, response => {
      let data = '';
      if (response.statusCode !== 200) {
        response.resume(); return reject(Error('Máy chủ IP trả về mã ' + response.statusCode));
      }
      response.on('data', chunk => {
        data += chunk.toString('utf8');
        if (data.length > 8192) request.destroy(Error('Phản hồi quá lớn'));
      });
      response.once('end', () => {
        try {
          const ip = JSON.parse(data).ip;
          if (!net.isIP(ip)) throw Error('IP không hợp lệ');
          resolve(ip);
        } catch (error) { reject(error); }
      });
      response.once('error', reject);
    });
    request.once('timeout', () => request.destroy(Error('Hết hạn kiểm tra mạng')));
    request.once('error', reject);
  });
}

async function checkProxy(input, { directProbe = directIp, proxyProbe = viaProxy } = {}) {
  const started = Date.now();
  const config = validateProxy(input);
  if (!config.ok) return { status: 'error', message: config.message };
  try {
    if (config.type === 'direct') {
      const ip = await directProbe();
      return { status: 'success', ip, type: 'direct', latency: Date.now() - started, verified: true };
    }
    const ip = await proxyProbe(config);
    let direct = null;
    try { direct = await directProbe(); } catch (_) { /* Do not assume proxy differs without comparison. */ }
    const sameIp = direct && ip === direct;
    return {
      status: sameIp ? 'warning' : 'verified', ip,
      type: config.type, latency: Date.now() - started,
      verified: true, directIp: direct, matchesDirectIp: sameIp || false,
      message: sameIp ? 'IP thoát trùng với IP trực tiếp; hãy kiểm tra cấu hình mạng.'
        : direct ? 'IP thoát proxy đã được xác minh bằng HTTPS.'
          : 'Đã xác minh IP thoát; không đo được IP trực tiếp để so sánh.'
    };
  } catch (error) {
    return { status: 'error', message: error.message || 'Không xác minh được proxy', verified: false };
  }
}
module.exports = { checkProxy, validateProxy, parseRemoteIp, directIp, viaProxy };
