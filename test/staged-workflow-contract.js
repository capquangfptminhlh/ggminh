'use strict';
// Static contract test only. It guards the proposed Gate 2 workflow artifact
// against the previously reproduced missing $RUNNER_TEMP runtime path.
// It does NOT claim Camoufox installed Windows measurements occurred.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname, '..', 'release/workflows/camoufox-upstream-smoke.yml'), 'utf8');
const active = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/camoufox-upstream-smoke.yml'), 'utf8');
const generate = yaml.slice(yaml.indexOf('- name: Generate two pinned identities'), yaml.indexOf('- name: Measure two configured'));
assert.ok(generate.includes('npm install --prefix "$runtime"'), 'must install into dedicated runtime prefix');
assert.ok(generate.includes('camoufox@0.5.8 playwright-core@1.62.0'), 'must pin official launcher runtime');
assert.ok(generate.includes('if($LASTEXITCODE -ne 0)'), 'runtime installation must fail closed');
assert.ok(generate.includes("throw 'Pinned camoufox launcher runtime missing'"), 'runtime guard must remain');
assert.ok(yaml.includes('integration/v5.8-wave-r') && yaml.includes('      - main'), 'post-merge branches must be eligible');
assert.ok(yaml.includes('LHM-Stage0-Camoufox-Configured-Report'), 'configured measurement report upload remains');
assert.ok(yaml.includes('Restore Node.js 22 for official identity generator'), 'staged official generator requires Node.js 22');
assert.ok(active.includes('Restore Node.js 22 for official identity generator'), 'active official generator requires Node.js 22');
assert.ok(active.includes('npm install --prefix "$runtime"'), 'active workflow must install pinned runtime into correct prefix');
assert.ok(active.includes('LHM-Stage0-Camoufox-Configured-Report'), 'active workflow must upload configured measurement report');
for(const [name,wf] of [['staged',yaml],['active',active]]) {
 const step=wf.slice(wf.indexOf('- name: Measure two configured Camoufox profiles'),wf.indexOf('- name: Publish only the configured Stage-0 report'));
 assert.ok(step.includes('LHM_CAMOUFOX_EXE_SHA256 = (Get-FileHash'), name+': configured test must receive approved engine digest');
}
console.log('staged-workflow-contract: PASS (static patch check only; real configured Windows run NOT_RUN)');

assert.ok(active.includes('release/v5.8.0-commercial-preflight-20261022'), 'release candidate must trigger configured Windows verification');
