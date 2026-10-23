'use strict';
/**
 * Local profile-status refresh. One outstanding IPC read per renderer,
 * stale replies ignored after explicit refresh, failures observable/retryable.
 * No network, storage, credentials or browser-launch side effects.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LHMProfileStatusPoller = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function parseActiveList(value) {
    if (!Array.isArray(value)) throw new TypeError('Expected active browser list');
    const ids = new Set();
    for (const row of value) {
      if (!row || typeof row.profileId !== 'string' || !row.profileId ||
          ids.has(row.profileId)) {
        throw new TypeError('Invalid or duplicate active profile ID');
      }
      ids.add(row.profileId);
    }
    return value;
  }

  function differs(activeList, currentIds) {
    const current = new Set(currentIds);
    return activeList.length !== current.size ||
      activeList.some(item => !current.has(item.profileId));
  }

  function create({ readActive, getCurrentIds, onUpdate, onStatus,
                    intervalMs = 2000, schedule = setInterval,
                    unschedule = clearInterval } = {}) {
    if (![readActive, getCurrentIds, onUpdate, onStatus, schedule, unschedule]
        .every(value => typeof value === 'function')) {
      throw new TypeError('Status poller requires callback functions');
    }
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 500) {
      throw new RangeError('Status refresh interval must be at least 500ms');
    }

    let timer = null;
    let pending = null;
    let generation = 0;
    let lastStatus = 'idle';
    let stopped = false;
    function setStatus(next) {
      if (lastStatus !== next) {
        lastStatus = next;
        onStatus(next);
      }
    }
    function invalidate() {
      // A manual refresh wins over an older, slower periodic IPC response.
      generation += 1;
    }
    function poll() {
      if (stopped) return Promise.resolve({ state:'stopped' });
      if (pending) return pending;
      const issuedAt = generation;
      const request = Promise.resolve().then(readActive)
        .then(rows => {
          parseActiveList(rows); // Malformed response cannot silently clear rows.
          if (stopped || generation !== issuedAt) return { state:'stale' };
          if (differs(rows, getCurrentIds())) onUpdate(rows);
          setStatus('healthy');
          return { state:'ok' };
        })
        .catch(() => {
          if (!stopped && generation === issuedAt) setStatus('error');
          return { state:'error' }; // Never emit an unhandled promise rejection.
        })
        .finally(() => {
          if (pending === request) pending = null;
        });
      pending = request;
      return request;
    }
    function start() {
      if (stopped || timer !== null) return;
      timer = schedule(() => { void poll(); }, intervalMs);
    }
    function stop() {
      stopped = true;
      invalidate();
      if (timer !== null) unschedule(timer);
      timer = null;
    }
    function markSnapshotLoaded() {
      // Called only after a successful explicit full refresh.
      setStatus('healthy');
    }
    function markSnapshotFailed() {
      // Keep internal and visible status in sync after a manual IPC failure.
      setStatus('error');
    }
    return Object.freeze({ poll, start, stop, invalidate, markSnapshotLoaded, markSnapshotFailed,
      getStatus: () => lastStatus });
  }

  return Object.freeze({ parseActiveList, differs, create });
});
