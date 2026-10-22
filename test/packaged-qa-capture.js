'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveQaCaptureDir } = require('../src/ops/qaCapturePath');

const root = path.resolve('C:/lhm/app');
const userData = path.resolve('C:/lhm/qa-user-data');

assert.equal(
  resolveQaCaptureDir({ packaged: false, appRoot: root, userData }),
  path.join(root, 'dist'),
  'source runs keep the existing dist capture directory',
);
assert.equal(
  resolveQaCaptureDir({ packaged: true, appRoot: path.join(root, 'resources', 'app.asar'), userData }),
  path.join(userData, 'qa-captures'),
  'packaged runs write outside the read-only app.asar',
);
const override = path.resolve('C:/lhm/known-packaged-captures');
assert.equal(
  resolveQaCaptureDir({ packaged: true, appRoot: root, userData, override }),
  override,
  'QA can choose a known absolute output directory',
);
assert.throws(() => resolveQaCaptureDir({
  packaged: true, appRoot: root, userData, override: 'relative-output',
}), /absolute/);
assert.throws(() => resolveQaCaptureDir({
  packaged: true, appRoot: root, userData,
  override: path.join(root, 'resources', 'app.asar', 'dist'),
}), /app\.asar/);

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const workflowSource = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'windows-exe.yml'), 'utf8');
assert(mainSource.includes("require('./src/ops/qaCapturePath')"));
assert(mainSource.includes('LHM_CI_UI_CAPTURE_DIR'));
assert(!mainSource.includes("path.join(__dirname, 'dist', 'workspace-preview.png')"),
  'main must not hard-code capture output inside a packaged app.asar');
assert(mainSource.includes('if (png.isEmpty())'),
  'QA capture must fail instead of writing an empty PNG');
assert(mainSource.includes('app.exit(process.exitCode || 0)'),
  'QA capture failure must propagate through the packaged process exit code');
assert(mainSource.includes('offscreen: qaCapture'),
  'QA capture must use Electron offscreen rendering on headless Windows hosts');
assert(workflowSource.includes('dist\\win-unpacked\\LHM Ads Browser.exe'),
  'CI must launch the packaged executable, not only the source Electron app');
assert(workflowSource.includes('workspace-engine-provider-preview.png'),
  'CI must verify all four QA views');
assert(workflowSource.includes('$proc.ExitCode -ne 0'),
  'CI must reject a packaged/source smoke process that exits non-zero');
assert(workflowSource.includes('.Length -eq 0'),
  'CI must reject empty screenshots');

console.log('packaged QA capture path: source compatibility, writable packaged target and unsafe override rejection passed');
