/**
 * Proxy Health and IP Checker
 */

async function checkProxy(proxyConfig) {
  const startTime = Date.now();
  try {
    // If no proxy, check direct connection
    if (!proxyConfig || !proxyConfig.host || proxyConfig.type === 'direct' || proxyConfig.type === 'none') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,query,isp', {
        signal: controller.signal
      });
      clearTimeout(timeout);

      const latency = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        return {
          status: 'success',
          ip: data.query,
          country: data.country,
          countryCode: data.countryCode,
          city: data.city,
          isp: data.isp,
          latency
        };
      }
    }

    // For proxy (HTTP / SOCKS5), we can format proxy URL and query via node-fetch or http agent
    // Since Node 24 native fetch supports agents or we can do basic socket connectivity check:
    const net = require('net');
    const host = proxyConfig.host;
    const port = parseInt(proxyConfig.port, 10);

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        resolve({
          status: 'success',
          ip: `${host}:${port}`,
          country: 'Proxy OK',
          latency,
          type: proxyConfig.type
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          status: 'error',
          message: 'Connection timed out (5000ms)'
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          status: 'error',
          message: err.message
        });
      });

      socket.connect(port, host);
    });

  } catch (err) {
    return {
      status: 'error',
      message: err.message
    };
  }
}

module.exports = { checkProxy };
