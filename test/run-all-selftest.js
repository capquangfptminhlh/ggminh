'use strict';
/*
 * Self-test for test/run-all.js: proves the runner does NOT
 * short-circuit. A fake chain with a failing step in the middle must
 * still execute the steps after it, must report every step's result,
 * and must exit non-zero. Also covers --filter subset selection and
 * the no-match guard. Uses only --chain (the runner's self-testing
 * entry point); the package.json chain is never touched.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('child_process');

const runner = path.join(__dirname, 'run-all.js');
const node = process.execPath;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-run-all-'));

function stepFile(name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return '"' + node + '" "' + p + '"';
}

try {
  const ok = stepFile('ok.js', 'console.log("STEP-OK");');
  const bad = stepFile('bad.js', 'console.log("STEP-BAD"); process.exit(3);');
  const after = stepFile('after.js', 'console.log("AFTER-FAIL-RAN");');
  const chain = [ok, bad, after].join(' && ');

  // 1. Failing middle step: later steps still run, exit code non-zero.
  const run = spawnSync(node, [runner, '--chain', chain], { encoding: 'utf8' });
  const out = run.stdout + run.stderr;
  assert.notEqual(run.status, 0, 'runner must exit non-zero when a step fails');
  assert.ok(out.includes('STEP-OK'), 'first step ran');
  assert.ok(out.includes('STEP-BAD'), 'failing step ran');
  assert.ok(out.includes('AFTER-FAIL-RAN'), 'step AFTER the failure still ran (no short-circuit)');
  assert.ok(/steps run: 3 of 3 \| PASS: 2 \| FAIL: 1/.test(out), 'summary counts all steps');
  assert.ok(/FAIL {2}step 2 {2}exit 3/.test(out), 'summary lists the failing step with its exit code');
  console.log('PASS run-all continues after a failing step and reports every step');

  // 2. --filter selects a subset; an all-pass subset exits 0.
  const filtered = spawnSync(node, [runner, '--chain', chain, '--filter', 'ok\\.js|after\\.js'],
    { encoding: 'utf8' });
  const fout = filtered.stdout + filtered.stderr;
  assert.equal(filtered.status, 0, 'all-pass filtered run must exit 0');
  assert.ok(/steps run: 2 of 3/.test(fout), 'filter selected exactly 2 steps');
  assert.ok(!fout.includes('STEP-BAD'), 'filtered-out step did not run');
  console.log('PASS run-all --filter runs only matching steps');

  // 3. A filter matching nothing must NOT report success.
  const none = spawnSync(node, [runner, '--chain', chain, '--filter', 'no-such-step-xyz'],
    { encoding: 'utf8' });
  assert.equal(none.status, 2, 'no-match filter must exit 2');
  console.log('PASS run-all refuses to report success when nothing was selected');

  // 4. An all-pass chain exits 0.
  const green = spawnSync(node, [runner, '--chain', [ok, after].join(' && ')], { encoding: 'utf8' });
  assert.equal(green.status, 0, 'all-pass chain must exit 0');
  console.log('PASS run-all exits 0 when every step passes');

  // 5. The repository entry point must stay short on Windows. The runner
  // reads the long canonical list from test:steps instead of recursively
  // reading the npm "test" entry point that invokes the runner itself.
  const repositoryList = spawnSync(node, [runner, '--list'], { encoding: 'utf8' });
  const repositoryOut = repositoryList.stdout + repositoryList.stderr;
  assert.equal(repositoryList.status, 0, 'repository step list must load');
  assert.ok(repositoryOut.includes('package.json script "test:steps"'),
    'default runner source must be the canonical test:steps script');
  assert.ok(!/^\d+\s+node test\/run-all\.js(?:\s|$)/m.test(repositoryOut),
    'canonical steps must not recursively invoke run-all.js');
  assert.match(repositoryOut, /\[run-all\] \d+ of \d+ steps listed/,
    'repository list reports a non-empty step count');
  console.log('PASS npm test uses the short runner entry point without recursion');

  console.log('run-all-selftest: all assertions passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
