const path = require('path');

function safeWebUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid start URL');
  const url = new URL(value);
  if (url.username || url.password) throw new Error('Start URL must not contain credentials');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Start URL must be http(s)');
  return url.toString();
}

function safeWebUrls(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 5)
    throw new Error('Startup URLs must contain 1–5 addresses');
  const urls = values.map(safeWebUrl);
  if (new Set(urls).size !== urls.length) throw new Error('Duplicate startup URLs');
  return urls;
}
function createLaunchArgs({ engine, profileDir, url, urls, fingerprint = {}, proxy = {}, extensionDir = null, extensionDirs = [], port = null }) {
  if (!path.isAbsolute(profileDir)) throw new Error('Profile directory must be absolute');
  const startUrls = safeWebUrls(urls === undefined ? [url] : urls);
  if (engine === 'gecko') {
    if (port) throw new Error('Gecko does not support Chromium CDP endpoints');
    return ['--no-remote', '--profile', profileDir, '--new-window', startUrls[0],
      ...startUrls.slice(1).flatMap(item => ['--new-tab', item])];
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
  const extensions=[...(extensionDir?[extensionDir]:[]),...extensionDirs];
  if(extensions.length>9||new Set(extensions).size!==extensions.length ||
     extensions.some(dir=>typeof dir!=='string'||!path.isAbsolute(dir)||dir.includes(',')))
    throw Error('Invalid Chromium extension directory list');
  if(extensions.length)args.push('--load-extension='+extensions.join(','));
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
  args.push(...startUrls);
  return args;
}

module.exports = { createLaunchArgs, safeWebUrl, safeWebUrls };
