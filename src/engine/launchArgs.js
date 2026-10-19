const path = require('path');

function safeWebUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid start URL');
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Start URL must not contain credentials');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Start URL must be http(s)');
  return url.toString();
}

function createLaunchArgs({ engine, profileDir, url, fingerprint = {}, proxy = {}, extensionDir = null, port = null }) {
  if (!path.isAbsolute(profileDir)) throw new Error('Profile directory must be absolute');
  const startUrl = safeWebUrl(url);
  if (engine === 'gecko') {
    // Gecko network preferences are applied to the isolated Firefox user.js by BrowserLauncher.
    if (port) throw new Error('Gecko does not support Chromium CDP endpoints');
    return ['--no-remote', '--profile', profileDir, '--new-window', startUrl];
  }
  if (engine !== 'chromium') throw new Error('Unsupported browser engine');
  const size = fingerprint.screen || {};
  const args = [
    '--user-data-dir=' + profileDir,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync', // Avoid accidentally syncing Chrome browser data between managed profiles.
    '--window-size=' + (size.width || 1280) + ',' + (size.height || 800)
  ];
  if (extensionDir) args.push('--load-extension=' + extensionDir);
  if (port !== null) {
    args.push('--remote-debugging-address=127.0.0.1');
    args.push('--remote-debugging-port=' + port);
  }
  if (fingerprint.mode !== 'native' && fingerprint.userAgent) args.push('--user-agent=' + fingerprint.userAgent);
  if (fingerprint.languages?.[0]) args.push('--lang=' + fingerprint.languages[0]);
  if (proxy.host || proxy.port) {
    if (!proxy.host || !/^[A-Za-z0-9_.:-]+$/.test(proxy.host)) throw new Error('Invalid proxy hostname');
    const proxyPort = Number(proxy.port);
    if (!Number.isInteger(proxyPort) || proxyPort <= 0 || proxyPort > 65535) throw new Error('Invalid proxy port');
    if (!['http', 'socks5'].includes(proxy.type)) throw new Error('Unsupported proxy protocol');
    args.push('--proxy-server=' + proxy.type + '://' + proxy.host + ':' + proxyPort);
  }
  args.push(startUrl);
  return args;
}

module.exports = { createLaunchArgs, safeWebUrl };
