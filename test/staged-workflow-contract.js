'use strict';
// Static contract test only. It guards the proposed Gate 2 workflow artifact
// against the previously reproduced missing $RUNNER_TEMP runtime path.
// It does NOT claim Camoufox installed Windows measurements occurred.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = fs.readFileSync(path.join(__dirname, '..', 'release/workflows/camoufox-upstream-smoke.yml'), 'utf8');
const generate = yaml.slice(yaml.indexOf('- name: Generate two pinned identities'), yaml.indexOf('- name: Measure two configured'));
assert.ok(generate.includes('npm install --prefix "$runtime"'), 'must install into dedicated runtime prefix');
assert.ok(generate.includes('camoufox@0.5.8 playwright-core@1.62.0'), 'must pin official launcher runtime');
assert.ok(generate.includes('if($LASTEXITCODE -ne 0)'), 'runtime installation must fail closed');
assert.ok(generate.includes("throw 'Pinned camoufox launcher runtime missing'"), 'runtime guard must remain');
assert.ok(yaml.includes('integration/v5.8-wave-r') && yaml.includes('      - main'), 'post-merge branches must be eligible');
assert.ok(yaml.includes('LHM-Stage0-Camoufox-Configured-Report'), 'configured measurement report upload remains');
console.log('staged-workflow-contract: PASS (static patch check only; real configured Windows run NOT_RUN)');
