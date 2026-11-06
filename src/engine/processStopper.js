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

// graceTree: the tracked PID is a launcher whose browser is its direct child,
// e.g. Windows Firefox run with --wait-for-browser. The launcher owns no
// window, so WM_CLOSE to it fails and the tree was force-killed (Firefox did
// not shut down cleanly). `taskkill /T` without /F did not close Firefox
// either (measured: forced after the full grace). WM_CLOSE to the launcher's
// direct children (the browser; content processes are its own children)
// closes Firefox cleanly in about 1 s.
function stopBrowserProcess(proc, {
  platform = process.platform, run = execFile, graceMs = DEFAULT_GRACE_MS,
  isChild = value => value instanceof ChildProcess, graceTree = false
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

  if (useTaskkill && graceTree) {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process -Filter "ParentProcessId=' + pid + '" | ForEach-Object { $_.ProcessId }'],
    { windowsHide: true }, (error, stdout) => {
      const children = String(stdout || '').split(/\s+/).map(Number)
        .filter(child => Number.isSafeInteger(child) && child > 0 && child !== pid);
      if (error || !children.length) return force();
      let pending = children.length, signalled = 0;
      for (const child of children) {
        run('taskkill', ['/PID', String(child)], { windowsHide: true }, closeError => {
          if (!closeError) signalled++;
          // No child had a closable window: do not wait out the grace period.
          if (--pending === 0 && !signalled) force();
        });
      }
    });
    armForce();
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
