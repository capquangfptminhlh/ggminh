const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Store = require('../src/db/store');
const { generateFingerprint, GPU_PROFILES } = require('../src/engine/fingerprint');
const { generateExtension } = require('../src/engine/extensionGenerator');
const BrowserLauncher = require('../src/engine/browserLauncher');
const { createApiServer } = require('../src/api/server');

async function runTests() {
  console.log('--- STARTING ENGINE VERIFICATION SUITE ---');

  // 1. Verify Store
  console.log('[Test 1] Testing Store persistence...');
  const testDataDir = path.resolve(__dirname, '../data_test');
  const store = new Store(testDataDir);

  const testProfile = {
    name: 'Test Profile Alpha',
    group: 'QA',
    proxy: { type: 'direct' },
    fingerprint: generateFingerprint({ os: 'Windows' })
  };

  const saved = store.saveProfile(testProfile);
  assert(saved.id, 'Profile ID must be automatically generated');
  assert.strictEqual(saved.name, 'Test Profile Alpha');

  const fetched = store.getProfile(saved.id);
  assert.strictEqual(fetched.name, 'Test Profile Alpha');
  console.log('✓ Store CRUD passed.');

  // 2. Verify Fingerprint Generator
  console.log('[Test 2] Testing Fingerprint generator...');
  const fpWin = generateFingerprint({ os: 'Windows' });
  assert.strictEqual(fpWin.os, 'Windows');
  assert.strictEqual(fpWin.platform, 'Win32');
  assert(fpWin.userAgent.includes('Windows NT 10.0'));
  assert(fpWin.webgl.renderer, 'Renderer must not be empty');
  assert(fpWin.canvasNoiseSeed > 0, 'Canvas noise seed must be positive');

  const fpMac = generateFingerprint({ os: 'macOS' });
  assert.strictEqual(fpMac.os, 'macOS');
  assert.strictEqual(fpMac.platform, 'MacIntel');
  console.log('✓ Fingerprint Generator passed.');

  // 3. Verify Extension Generator
  console.log('[Test 3] Testing Extension Generator...');
  const testExtDir = path.join(testDataDir, 'test_ext');
  generateExtension(saved, testExtDir);

  assert(fs.existsSync(path.join(testExtDir, 'manifest.json')), 'manifest.json must exist');
  assert(fs.existsSync(path.join(testExtDir, 'stealth.js')), 'stealth.js must exist');

  const manifest = JSON.parse(fs.readFileSync(path.join(testExtDir, 'manifest.json'), 'utf-8'));
  assert.strictEqual(manifest.manifest_version, 3);
  assert.strictEqual(manifest.content_scripts[0].world, 'MAIN');

  const stealthCode = fs.readFileSync(path.join(testExtDir, 'stealth.js'), 'utf-8');
  assert(stealthCode.includes('UNMASKED_VENDOR_WEBGL'), 'Must contain WebGL masking');
  assert(stealthCode.includes('getImageData'), 'Must contain Canvas masking');
  assert(stealthCode.includes('hardwareConcurrency'), 'Must contain hardware spoofing');
  console.log('✓ Extension Generator passed.');

  // 4. Verify Browser Binary Discovery
  console.log('[Test 4] Testing Browser Binary Locator...');
  const launcher = new BrowserLauncher(store);
  const browserBin = launcher.findBrowserBinary();
  assert(fs.existsSync(browserBin), `Browser binary must exist: ${browserBin}`);
  console.log(`✓ Browser Binary located: ${browserBin}`);

  // 5. Verify API Server
  console.log('[Test 5] Testing API Server routes...');
  const apiApp = createApiServer(store, launcher);
  assert(apiApp, 'Express app must be created');
  console.log('✓ API Server created successfully.');

  // Cleanup test folder
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n========================================');
  console.log('🎉 ALL ENGINE VERIFICATION TESTS PASSED!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
