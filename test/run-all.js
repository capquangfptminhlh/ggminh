'use strict';
/*
 * Full-report test runner (QA-005).
 *
 * The `test:steps` script in package.json is one long `&&` chain: the first
 * failing step aborts the run and hides every later result. This runner
 * reads THE SAME chain from package.json (single source of truth — the
 * step list is never duplicated here), executes EVERY step in the
 * original order regardless of earlier failures, and prints a complete
 * summary at the end: total steps, per-step PASS/FAIL with exit codes,
 * and durations. Exit code semantics are unchanged: 0 only when every
 * selected step passed, non-zero otherwise (2 for runner usage errors,
 * so a misconfigured invocation can never look green).
 *
 * Usage:
 *   node test/run-all.js                 run the full `test:steps` chain
 *   node test/run-all.js --filter <re>   run only steps whose command
 *                                        matches the regex (debugging)
 *   node test/run-all.js <re>            same as --filter
 *   node test/run-all.js --script <name> read another package.json
 *                                        script instead of `test:steps`
 *   node test/run-all.js --list          print the steps, run nothing
 *   node test/run-all.js --chain "<a> && <b>"
 *                                        run an explicit chain instead
 *                                        of package.json — intended ONLY
 *                                        for testing this runner itself
 *                                        (see run-all-selftest.js);
 *                                        normal runs must not use it.
 *
 * Execution model: each step is spawned with shell:true, the same way
 * npm itself executes package scripts (sh on POSIX, cmd.exe on
 * Windows), with stdio inherited so step output reads exactly like a
 * normal `npm test` log. The chain string is split on ' && ' first, so
 * no step may itself contain ' && ' — true for every current step
 * (all are plain `node <file>`, `node --check <file>`, or
 * `node <file> <args>`), and splitting is precisely what removes the
 * short-circuit behaviour. shell:true means the step string is handed
 * to the platform shell verbatim: quoting/metacharacter behaviour is
 * therefore identical to today's `npm test`, by construction — a
 * hand-rolled argv parser would be the divergence risk, not this.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function parseArgs(argv) {
  const opts = { script: 'test:steps', filter: null, chain: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--script') opts.script = argv[++i];
    else if (a === '--chain') opts.chain = argv[++i];
    else if (a === '--filter') opts.filter = argv[++i];
    else if (a === '--list') opts.list = true;
    else if (a.startsWith('--')) throw Error('Unknown option: ' + a);
    else if (opts.filter === null) opts.filter = a; // positional regex
    else throw Error('Unexpected argument: ' + a);
  }
  return opts;
}

function loadChain(opts) {
  if (opts.chain != null) return opts.chain;
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const chain = pkg.scripts && pkg.scripts[opts.script];
  if (typeof chain !== 'string' || !chain.trim()) {
    throw Error('package.json script "' + opts.script + '" is missing or empty');
  }
  return chain;
}

function runStep(command) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      shell: true, stdio: 'inherit', cwd: repoRoot, env: process.env,
    });
    child.on('error', (err) => resolve({
      code: null, signal: null, spawnError: String(err && err.message || err),
      ms: Date.now() - started,
    }));
    child.on('close', (code, signal) => resolve({
      code, signal, spawnError: null, ms: Date.now() - started,
    }));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let regex = null;
  if (opts.filter != null) {
    try { regex = new RegExp(opts.filter); }
    catch (e) { console.error('[run-all] invalid --filter regex: ' + e.message); process.exit(2); }
  }
  let chain;
  try { chain = loadChain(opts); }
  catch (e) { console.error('[run-all] ' + e.message); process.exit(2); }

  const all = chain.split(' && ').map((s) => s.trim()).filter(Boolean);
  const selected = all
    .map((command, i) => ({ index: i + 1, command }))
    .filter((s) => !regex || regex.test(s.command));

  if (opts.list) {
    console.log('[run-all] source: ' +
      (opts.chain != null ? 'explicit --chain' : 'package.json script "' + opts.script + '"'));
    for (const s of selected) console.log(s.index + '\t' + s.command);
    console.log('[run-all] ' + selected.length + ' of ' + all.length + ' steps listed');
    return;
  }
  if (selected.length === 0) {
    console.error('[run-all] no steps selected — refusing to report success');
    process.exit(2);
  }

  console.log('[run-all] running ' + selected.length + ' of ' + all.length +
    ' steps from ' + (opts.chain != null ? 'explicit --chain' : 'package.json script "' + opts.script + '"') +
    ' — every step runs, failures do not stop the chain');
  const results = [];
  const wallStarted = Date.now();
  for (const step of selected) {
    console.log('\n[run-all] step ' + step.index + '/' + all.length + ': ' + step.command);
    const r = await runStep(step.command);
    const pass = r.code === 0 && !r.signal && !r.spawnError;
    results.push({ ...step, ...r, pass });
    console.log('[run-all] -> ' + (pass ? 'PASS' : 'FAIL') +
      ' (exit ' + (r.spawnError ? 'spawn-error' : r.signal ? 'signal ' + r.signal : r.code) +
      ', ' + (r.ms / 1000).toFixed(1) + 's)');
  }
  const wallMs = Date.now() - wallStarted;

  const failed = results.filter((r) => !r.pass);
  console.log('\n================ run-all summary ================');
  console.log('steps run: ' + results.length + ' of ' + all.length +
    ' | PASS: ' + (results.length - failed.length) + ' | FAIL: ' + failed.length +
    ' | wall time: ' + (wallMs / 1000).toFixed(1) + 's');
  for (const r of results) {
    console.log((r.pass ? 'PASS' : 'FAIL') + '  step ' + r.index + '  exit ' +
      (r.spawnError ? 'spawn-error: ' + r.spawnError : r.signal ? 'signal ' + r.signal : r.code) +
      '  ' + (r.ms / 1000).toFixed(1) + 's  ' + r.command);
  }
  if (failed.length) {
    console.log('failed steps: ' + failed.map((r) => r.index).join(', '));
    process.exit(1);
  }
  console.log('all selected steps passed');
}

main().catch((e) => { console.error('[run-all] ' + (e && e.stack || e)); process.exit(2); });
