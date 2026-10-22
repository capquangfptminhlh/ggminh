'use strict';
/**
 * Single-instance lock wiring (Agent R12 reconstruction, applied by
 * the Wave R coordinator). Static assertions in the style of
 * test/integration-wiring.js: the behavioural proof (launch the EXE
 * twice) belongs to Gate 3, but the init ORDER is checkable here and
 * is the part that silently breaks if main.js is refactored:
 *   - the lock is requested inside whenReady,
 *   - AFTER the LHM_CI_UI_CAPTURE per-PID setPath (parallel CI
 *     captures own separate userData dirs and must not block),
 *   - BEFORE the legacy migration / new Store(...) (a second writer
 *     must never reach the store),
 *   - a failed lock quits the second instance,
 *   - a 'second-instance' handler surfaces the primary window.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { failures++; console.log('FAIL ' + name + ' :: ' + error.message); }
}

check('lock is requested and a second-instance handler is registered', () => {
  assert.ok(mainSrc.includes('app.requestSingleInstanceLock()'),
    'main.js must call app.requestSingleInstanceLock()');
  assert.ok(mainSrc.includes("app.on('second-instance'"),
    'main.js must register a second-instance handler');
});

check('lock order: CI setPath -> lock -> new Store', () => {
  const readyAt = mainSrc.indexOf('app.whenReady().then');
  assert.ok(readyAt >= 0, 'whenReady block found');
  const body = mainSrc.slice(readyAt);
  const setPathAt = body.indexOf("app.setPath('userData'");
  const lockAt = body.indexOf('app.requestSingleInstanceLock()');
  const storeAt = body.indexOf('new Store(');
  assert.ok(setPathAt >= 0 && lockAt > setPathAt,
    'lock must come after the CI-capture setPath inside whenReady');
  assert.ok(storeAt > lockAt,
    'lock must come before Store construction inside whenReady');
});

check('failed lock quits before any store work', () => {
  const lockAt = mainSrc.indexOf('app.requestSingleInstanceLock()');
  const segment = mainSrc.slice(lockAt, lockAt + 200);
  assert.ok(segment.includes('app.quit()'),
    'the not-locked branch must quit the second instance');
});

console.log(failures ? ('single-instance-lock: ' + failures + ' FAIL') : 'single-instance-lock: PASS');
process.exitCode = failures ? 1 : 0;
