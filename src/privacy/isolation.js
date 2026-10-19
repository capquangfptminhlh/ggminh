const fs = require('fs');
const path = require('path');

const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/;
function assertProfileId(id) {
  if (typeof id !== 'string' || !VALID_ID.test(id)) throw new Error('Invalid profile ID');
  return id;
}
function isolatedPaths(baseDir, id, engine = 'chromium') {
  assertProfileId(id);
  if (engine !== 'chromium' && engine !== 'gecko') throw new Error('Unsupported engine');
  if (!path.isAbsolute(baseDir)) throw new Error('Profile storage root must be absolute');
  const browserRoot = path.join(baseDir, engine === 'gecko' ? 'gecko-profiles' : 'profiles');
  return {
    browserRoot,
    profileDir: path.join(browserRoot, id),
    extensionDir: path.join(baseDir, 'extensions', id)
  };
}
function rejectSymlinks(baseDir, profileDir) {
  const root = path.resolve(baseDir);
  const target = path.resolve(profileDir);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Profile path escapes local storage root');
  }
  // Avoid a filesystem junction/symlink pointing profiles at another profile.
  for (let current = target; current !== root; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('Storage link detected: profile directories must be independent');
    }
  }
}
function ensureIsolatedDirectory(baseDir, directory) {
  rejectSymlinks(baseDir, directory);
  fs.mkdirSync(directory, { recursive: true });
  rejectSymlinks(baseDir, directory);
  return directory;
}

function auditIsolation(baseDir, profiles, { isRunning = () => false } = {}) {
  if (!Array.isArray(profiles)) throw new Error('Profile list must be an array');
  const entries = [];
  const seen = new Map();
  for (const profile of profiles) {
    const report = { profileId: profile.id, name: profile.name, engine: profile.engine === 'gecko' ? 'gecko' : 'chromium', running: !!isRunning(profile.id), issues: [] };
    try {
      const paths = isolatedPaths(baseDir, profile.id, report.engine);
      rejectSymlinks(baseDir, paths.profileDir);
      if (report.engine === 'chromium') rejectSymlinks(baseDir, paths.extensionDir);
      const normal = process.platform === 'win32'
        ? paths.profileDir.toLowerCase() : paths.profileDir;
      if (seen.has(normal)) report.issues.push('Thư mục hồ sơ trùng với hồ sơ ' + seen.get(normal));
      seen.set(normal, profile.id);
      report.storageSeparate = report.issues.length === 0;
      report.storageInitialized = fs.existsSync(paths.profileDir);
    } catch (error) {
      report.storageSeparate = false;
      report.storageInitialized = false;
      report.issues.push(error.message);
    }
    entries.push(report);
  }
  return {
    checked: entries.length,
    storageSeparate: entries.every(x => x.storageSeparate),
    warnings: entries.reduce((n, x) => n + x.issues.length, 0),
    entries,
    disclaimer: 'Chỉ kiểm tra đường dẫn lưu trữ cục bộ, không bảo đảm ẩn danh, IP riêng hoặc các tài khoản không bị Google liên kết.'
  };
}
module.exports = { assertProfileId, isolatedPaths, rejectSymlinks, ensureIsolatedDirectory, auditIsolation };
