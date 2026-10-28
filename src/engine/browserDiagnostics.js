const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/**
 * Diagnoses the actual installed browsers, not a fictional "LHM-owned engine".
 * Only a user click triggers --version process execution; no websites opened.
 */
function optionsFor(settings = {}) {
  return [
    { id: 'chrome', name: 'Google Chrome (Chromium)', candidates: [
      settings.chromePath, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe')
    ] },
    { id: 'edge', name: 'Microsoft Edge (Chromium)', candidates: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ] },
    { id: 'firefox', name: 'Mozilla Firefox (Gecko)', candidates: [
      settings.geckoPath,'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Mozilla Firefox','firefox.exe')
    ] }
  ];
}
// Firefox from the Microsoft Store / winget is an MSIX package. Its only
// launchable path is an app execution alias (stat() -> EACCES, so existsSync
// is false) that starts the real firefox.exe and exits at once: the launcher
// would track the stub, report the profile as closed and lose a running browser.
const MSIX_FIREFOX_MESSAGE = 'Firefox bản Microsoft Store/winget (MSIX) chưa được hỗ trợ: ' +
  'ứng dụng không theo dõi được cửa sổ của bản này. Hãy cài Firefox từ mozilla.org (bản cài thường) rồi thử lại.';
const isWindowsAppsPath = p => typeof p === 'string' && /[\\/]WindowsApps[\\/]/i.test(p);
function msixFirefoxPath(settings = {}, { lstatSync = fs.lstatSync, env = process.env } = {}) {
  if (isWindowsAppsPath(settings.geckoPath)) return settings.geckoPath;
  if (!env.LOCALAPPDATA) return null;
  const alias = path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'firefox.exe');
  try { lstatSync(alias); return alias; } catch (_) { return null; }
}
function parseVersion(output) {
  const text = String(output || '').slice(0, 1000);
  const match = text.match(/(?:Chrome|Chromium|Edge|Firefox)\s+(?:version\s+)?(\d+(?:\.\d+){1,3})/i)
    || text.match(/\b(\d{2,3}\.\d+(?:\.\d+){0,2})\b/);
  return match ? match[1] : null;
}
function execVersion(executable, command = execFile) {
  return new Promise(resolve => {
    command(executable, ['--version'], {
      timeout: 5000, maxBuffer: 16384, windowsHide: true,
      shell: false
    }, (error, stdout, stderr) => {
      if (error) resolve({ error: String(error.message || error).slice(0, 180), version: null });
      else resolve({ error: null, version: parseVersion(stdout || stderr) });
    });
  });
}
async function diagnoseBrowsers(settings = {}, { existsSync = fs.existsSync, command = execFile,
  lstatSync = fs.lstatSync, env = process.env } = {}) {
  const result = await Promise.all(optionsFor(settings).map(async option => {
    const bin = option.candidates.filter(Boolean).find(p => {
      try { return path.isAbsolute(p) && !isWindowsAppsPath(p) && existsSync(p); } catch (_) { return false; }
    });
    if (!bin && option.id === 'firefox' && msixFirefoxPath(settings, { lstatSync, env }))
      return { id: option.id, name: option.name, status: 'error', installed: true, path: null, version: null,
        message: MSIX_FIREFOX_MESSAGE };
    if (!bin) return { id: option.id, name: option.name, status: 'missing', installed: false, path: null, version: null, message: 'Không tìm thấy. Hãy kiểm tra thư mục cài đặt.' };
    const found = await execVersion(bin, command);
    if (found.error) return { id: option.id, name: option.name, path: bin, installed: true, version: null,
      status: 'error', message: 'Đã tìm thấy tệp nhưng không đọc được phiên bản: ' + found.error };
    if (!found.version) return { id: option.id, name: option.name, path: bin, installed: true, version: null,
      status: 'warning', message: 'Không đọc được phiên bản từ lệnh --version; cần kiểm tra thủ công.' };
    const major = Number(found.version.split('.')[0]);
    const old = major < 140; // Advisory threshold only; Firefox ESR versions can differ.
    return { id: option.id, name: option.name, path: bin, installed: true, version: found.version,
      status: old ? 'warning' : 'ready',
      message: old ? 'Phiên bản có thể đã cũ. Kiểm tra cập nhật bảo mật của nhà cung cấp.'
        : 'Phát hiện phiên bản trình duyệt. Chưa kiểm tra cập nhật bảo mật trực tuyến.' };
  }));
  return {
    checkedAt: new Date().toISOString(), engines: result,
    note: 'LHM đang sử dụng engine cài trên máy. Công cụ không kiểm tra CVE, cập nhật mới nhất hoặc mức độ bị Google nhận diện.'
  };
}
module.exports = { diagnoseBrowsers, optionsFor, parseVersion, execVersion,
  msixFirefoxPath, isWindowsAppsPath, MSIX_FIREFOX_MESSAGE };
