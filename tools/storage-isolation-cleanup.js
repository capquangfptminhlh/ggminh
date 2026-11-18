'use strict';

// Only handles launcher instances and the loopback server created by the test.
// Never target external PIDs; if a browser cannot be stopped, report it.
async function withIsolationCleanup({ server, launchers, timeoutMs = 20000, onCleanup = () => {} }, run) {
  let originalError;
  try {
    return await run();
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    const errors = [];
    const deadline = Date.now() + timeoutMs;
    const stops = [];
    let pendingStops = 0;
    for (const launcher of launchers) {
      for (const id of launcher.activeProcesses.keys()) {
        try {
          const result = launcher.stop(id);
          pendingStops++;
          stops.push(Promise.resolve(result).catch(error => { errors.push(String(error.message || error)); })
            .finally(() => { pendingStops--; }));
        } catch (error) { errors.push(String(error.message || error)); }
      }
    }
    let timeout;
    await Promise.race([Promise.all(stops), new Promise(resolve => { timeout = setTimeout(resolve, Math.max(0, deadline - Date.now())); })]);
    clearTimeout(timeout);
    if (pendingStops) errors.push('stop requests timed out');
    while (launchers.some(launcher => launcher.activeProcesses.size > 0) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
    }
    const remaining = launchers.flatMap(launcher => [...launcher.activeProcesses.keys()]);
    let serverClosed = false;
    try {
      await Promise.race([
        new Promise(resolve => server.close(() => { serverClosed = true; resolve(); })),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
    } catch (error) { errors.push(String(error.message || error)); }
    const cleanup = { complete: remaining.length === 0 && serverClosed && errors.length === 0, remaining, serverClosed, errors };
    onCleanup(cleanup);
    if (!originalError && !cleanup.complete) throw Error('Isolation cleanup incomplete');
  }
}

module.exports = { withIsolationCleanup };
