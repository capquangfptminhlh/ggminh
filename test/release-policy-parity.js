'use strict';
// Release policy parity: source-of-truth values in runtime code, docs and
// installer config must agree before a release artifact may claim QA PASS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const { TRIAL_DAYS, TRIAL_MAX_PROFILES } = require('../src/licensing/enforcement');
const acceptance = read('docs/acceptance/gate-3-wave2.md');
const guide = read('docs/customer-guide/01-cai-dat-va-kich-hoat.md');
const customer = read('docs/release/WHATS-IN-THE-BOX.md');
const pkg = JSON.parse(read('package.json'));
assert.equal(TRIAL_DAYS, 10, 'Wave R trial policy changed; review product release documents');
assert.equal(TRIAL_MAX_PROFILES, 10, 'Wave R trial capacity changed; review product release documents');
assert.ok(guide.includes('dùng thử ' + TRIAL_DAYS + ' ngày'), 'customer guide disagrees with runtime trial');
assert.ok(customer.includes('dùng thử ' + TRIAL_DAYS + ' ngày'), 'release box disagrees with trial');
assert.ok(acceptance.includes('**' + TRIAL_DAYS + ' ngày, tối đa ' + TRIAL_MAX_PROFILES + ' hồ'),
  'Gate 3 policy must describe the runtime product');
assert.ok(acceptance.includes('dùng thử ' + TRIAL_DAYS + ' ngày/' + TRIAL_MAX_PROFILES + ' hồ sơ'),
  'Gate 3 checklist summary must match runtime');
assert.ok(!/dùng thử\s+(?:\*\*)?30 ngày/i.test(acceptance), 'stale 30-day trial must be removed');
assert.equal(pkg.build?.win?.icon, 'build/icon.ico', 'Windows installer config must reference LHM icon');
assert.ok(fs.existsSync(path.join(root, pkg.build.win.icon)), 'LHM Windows icon missing');
for (const [label, content] of [['guide', guide], ['acceptance', acceptance], ['release', customer]])
  assert.ok(!/Run anyway/i.test(content), label + ' must not instruct SmartScreen bypass');
console.log('release-policy-parity: PASS (trial, cap, icon, release instructions)');
