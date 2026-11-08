'use strict';
/**
 * Graceful-first browser shutdown.
 *
 * A hard TerminateProcess (what ChildProcess.kill() does on Windows) stops
 * Chromium before it flushes its cookie store: cookies written in the last
 * ~30 s (typically a fresh login) are lost. Measured on Chrome 156 / Edge 156:
 * kill() -> cookie gone after reopen; WM_CLOSE -> cookie kept, exit < 0.5 s.
 *
 * Windows: `taskkill /PID <pid>` WITHOUT /T and /F posts WM_CLOSE to the
 * browser's own windows, which runs the normal shutdown path. /T must not be
 * used for the graceful step: it also signals the GPU/network children,
 * which leaves Chrome running with its window open. Only when the browser
 * has not exited after `graceMs` (e.g. a "Leave site?" dialog, no window)
 * is the whole tree force-terminated.
 * POSIX: SIGTERM is Chromium/Firefox's graceful shutdown; SIGKILL after grace.
 *
 * OS-level commands are only issued for real ChildProcess objects spawned by
 * this app, never for arbitrary PIDs.
 */
const { execFile, ChildProcess } = require('child_process');

const DEFAULT_GRACE_MS = 10000;

function hasExited(proc) {
  return proc.exitCode !== null && proc.exitCode !== undefined ||
    proc.signalCode !== null && proc.signalCode !== undefined;
}

// Child process IDs of `pid` (Windows). pid is a validated integer.
function listChildPids(pid, run, done) {
  run('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process -Filter "ParentProcessId=' + pid + '" | ForEach-Object { $_.ProcessId }'],
  { windowsHide: true }, (error, stdout) => {
    if (error) return done([]);
    done(String(stdout || '').split(/\s+/).map(Number).filter(n => Number.isSafeInteger(n) && n > 0 && n !== pid));
  });
}

// closeBrowserChild (Firefox on Windows): the spawned firefox.exe is a
// windowless launcher kept alive by --wait-for-browser; the browser window
// belongs to its child process. Measured on Windows CI:
//   taskkill /PID <launcher>      -> fails (no window), app fell to /T /F
//   taskkill /PID <launcher> /T   -> browser does NOT close, killed at grace end
//   taskkill /PID <browser child> -> browser closes in 0.6 s, exit code 0
// A forced kill lost localStorage written just before Stop.
function stopBrowserProcess(proc, {
  platform = process.platform, run = execFile, graceMs = DEFAULT_GRACE_MS,
  isChild = value => value instanceof ChildProcess, closeBrowserChild = false
} = {}) {
  if (!proc || typeof proc.kill !== 'function') return false;
  if (hasExited(proc)) return false;
  const pid = proc.pid;
  const useTaskkill = platform === 'win32' && isChild(proc) &&
    Number.isSafeInteger(pid) && pid > 0;
  let done = false, timer = null;
  const finish = () => { done = true; if (timer) clearTimeout(timer); };
  proc.once?.('exit', finish);

  const force = () => {
    if (done || hasExited(proc)) return;
    if (useTaskkill) {
      run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error && !done && !hasExited(proc)) { try { proc.kill('SIGKILL'); } catch (_) {} }
      });
    } else {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }
  };
  const armForce = () => {
    if (done) return;
    timer = setTimeout(force, graceMs);
    timer.unref?.();
  };

  if (useTaskkill && closeBrowserChild) {
    armForce();
    listChildPids(pid, run, children => {
      if (done || hasExited(proc)) return;
      // Close the browser's own window gracefully; if no child is visible yet
      // (still starting), the grace timer force-closes the tree.
      if (children.length) run('taskkill', children.flatMap(c => ['/PID', String(c)]), { windowsHide: true }, () => {});
    });
    return true;
  }
  if (useTaskkill) {
    run('taskkill', ['/PID', String(pid)], { windowsHide: true }, error => {
      // No closable window (headless, still starting): nothing will close
      // gracefully, so do not wait out the grace period.
      if (error) force();
    });
    armForce();
    return true;
  }
  let sent;
  try { sent = proc.kill('SIGTERM'); } catch (_) { sent = false; }
  if (sent === false) { finish(); return false; }
  armForce();
  return true;
}

module.exports = { stopBrowserProcess, DEFAULT_GRACE_MS };
