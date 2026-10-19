const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { isolatedPaths, rejectSymlinks, ensureIsolatedDirectory, auditIsolation } = require('../src/privacy/isolation');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-isolation-'));
try {
  const a = isolatedPaths(root, 'pb_one', 'chromium');
  const b = isolatedPaths(root, 'pb_two', 'chromium');
  const gecko = isolatedPaths(root, 'pb_one', 'gecko');
  assert.notStrictEqual(a.profileDir, b.profileDir);
  assert.notStrictEqual(a.profileDir, gecko.profileDir);
  assert.notStrictEqual(a.extensionDir, b.extensionDir);
  assert.throws(() => isolatedPaths(root, '../escape'), /Invalid profile ID/);
  assert.throws(() => isolatedPaths(root, 'p', 'unknown'), /Unsupported/);
  assert.throws(() => rejectSymlinks(root, path.join(root, '..', 'outside')), /escapes/);
  ensureIsolatedDirectory(root, a.profileDir);
  ensureIsolatedDirectory(root, b.profileDir);
  ensureIsolatedDirectory(root, gecko.profileDir);
  fs.writeFileSync(path.join(a.profileDir, 'a-cookie-test'), 'only A');
  assert(!fs.existsSync(path.join(b.profileDir, 'a-cookie-test')));
  assert(!fs.existsSync(path.join(gecko.profileDir, 'a-cookie-test')));
  const profiles=[
    { id:'pb_one',name:'One',engine:'chromium' },
    { id:'pb_two',name:'Two',engine:'chromium' },
    { id:'pb_one',name:'One Gecko',engine:'gecko' }
  ];
  const summary=auditIsolation(root,profiles,{isRunning:id=>id==='pb_two'});
  assert(summary.storageSeparate);
  assert.strictEqual(summary.checked,3);
  assert.strictEqual(summary.entries.filter(p=>p.running).length,1);
  assert.strictEqual(summary.warnings,0);
  const duplicate=auditIsolation(root,[profiles[0],{...profiles[0],name:'Duplicate'}]);
  assert.strictEqual(duplicate.storageSeparate,false);
  assert(duplicate.warnings>0);
  const outside=path.join(root,'profiles','pb_symlink');
  try {
    fs.symlinkSync(b.profileDir,outside,'dir');
    assert.throws(() => ensureIsolatedDirectory(root,outside), /Storage link/);
    assert.strictEqual(auditIsolation(root,[{id:'pb_symlink',name:'Bad'}]).storageSeparate,false);
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
  }
  console.log('Filesystem profile isolation tests passed');
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
