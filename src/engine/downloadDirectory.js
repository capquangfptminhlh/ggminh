'use strict';
/**
 * Per-profile download folders.
 *
 * Without an explicit setting Chromium and Firefox save every profile's
 * downloads into the same OS Downloads folder, so a file downloaded in
 * profile A is visible from profile B's upload/open dialogs. Each profile
 * gets <downloadsRoot>/<profileId>.
 *
 * Chromium: Default/Preferences `download.default_directory` and
 * `savefile.default_directory` are set when missing, or when they point at
 * ANOTHER profile's folder under the same root (a copied/restored profile
 * directory). A folder the user picked deliberately elsewhere is kept.
 * Firefox/Camoufox: an LHM-managed user.js block (re-applied every launch).
 */
const fs = require('fs');
const path = require('path');
const { assertProfileId } = require('../privacy/isolation');
const { writeManagedUserJsBlock } = require('./geckoProxy');

const GECKO_BEGIN = '// LHM_MANAGED_DOWNLOADS_BEGIN';
const GECKO_END = '// LHM_MANAGED_DOWNLOADS_END';
const MAX_PREFS_BYTES = 8 * 1024 * 1024;

function profileDownloadDir(downloadsRoot, profileId) {
  assertProfileId(profileId);
  if (typeof downloadsRoot !== 'string' || !path.isAbsolute(downloadsRoot))
    throw Error('Download root must be an absolute path');
  return path.join(downloadsRoot, profileId);
}

function ensureRealDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw Error('Profile download folder must be a real directory');
  return dir;
}

function samePath(a, b) {
  const x = path.resolve(a), y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}
function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
// Keep the user's own choice; replace only "unset" or "another profile's folder".
function shouldReplace(current, own, downloadsRoot) {
  if (typeof current !== 'string' || !current.trim()) return true;
  if (samePath(current, own)) return false;
  return samePath(current, downloadsRoot) || isInside(downloadsRoot, current);
}

function applyChromiumDownloadDir(profileDir, downloadsRoot, profileId) {
  if (!path.isAbsolute(profileDir)) throw Error('Profile directory must be absolute');
  const own = ensureRealDirectory(profileDownloadDir(downloadsRoot, profileId));
  const defaultDir = path.join(profileDir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });
  const file = path.join(defaultDir, 'Preferences');
  let prefs = {};
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw Error('Refusing to modify linked or nonregular Chromium Preferences');
    if (stat.size > MAX_PREFS_BYTES) throw Error('Chromium Preferences file too large');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prefs = parsed;
      else throw Error('not an object');
    } catch (_) {
      // Chromium itself discards an unreadable Preferences file. Keep a copy
      // instead of silently destroying it, then start from a clean object.
      fs.copyFileSync(file, file + '.lhm-unreadable');
      prefs = {};
    }
  }
  const download = prefs.download && typeof prefs.download === 'object' ? prefs.download : {};
  const savefile = prefs.savefile && typeof prefs.savefile === 'object' ? prefs.savefile : {};
  let changed = false;
  if (shouldReplace(download.default_directory, own, downloadsRoot)) {
    download.default_directory = own; download.directory_upgrade = true; changed = true;
  }
  if (shouldReplace(savefile.default_directory, own, downloadsRoot)) {
    savefile.default_directory = own; changed = true;
  }
  if (!changed) return { file, directory: download.default_directory, changed: false };
  prefs.download = download; prefs.savefile = savefile;
  const temp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(prefs), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch (_) {}
    throw error;
  }
  return { file, directory: own, changed: true };
}

function applyGeckoDownloadDir(profileDir, downloadsRoot, profileId) {
  const own = ensureRealDirectory(profileDownloadDir(downloadsRoot, profileId));
  const body = [
    ['browser.download.dir', own],
    ['browser.download.folderList', 2],
    ['browser.download.lastDir', own]
  ].map(([name, value]) => 'user_pref(' + JSON.stringify(name) + ', ' + JSON.stringify(value) + ');').join('\n');
  writeManagedUserJsBlock(profileDir, GECKO_BEGIN, GECKO_END, body, 'downloads');
  return { directory: own, changed: true };
}

module.exports = {
  profileDownloadDir, applyChromiumDownloadDir, applyGeckoDownloadDir,
  GECKO_BEGIN, GECKO_END
};
