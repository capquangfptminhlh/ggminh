'use strict';
/**
 * Exit-IP observation store (Constitution Sections 19, 20.3, 22).
 *
 * The app could already MEASURE an exit IP (proxyChecker) but never
 * RECORDED it, so the automatic IP warnings (src/health/autoIpWarnings.js)
 * had no real input. This store persists minimal observations
 * {profileId, ip, observedAt, sessionId} next to the other monitor data.
 * Only the observed address is kept — no page content, no credentials.
 * Retention mirrors the behaviour monitor policy: newest 20,000 entries,
 * at most 7 days old. The file is written atomically (temporary file +
 * rename, like the profile store and the behaviour monitor) with mode
 * 0o600, so an interrupted write can never leave a torn file behind.
 * An existing file that cannot be parsed is preserved as a
 * `.corrupt-*` sibling instead of being silently discarded.
 *
 * Schema extension (backward compatible): an entry MAY carry `source`,
 * one of OBSERVATION_SOURCES, stating WHERE the observation was made —
 * Constitution 19.3 forbids substituting a manager-process result for a
 * profile-runtime result, so the two origins are labelled, never merged.
 * Entries written before this field existed have no `source` key and
 * load unchanged; `record()` only writes the key when a valid source is
 * supplied, so legacy-shaped entries stay byte-identical in shape.
 */
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 20000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const OBSERVATION_SOURCES = Object.freeze(['browser-runtime', 'manager-process']);

function isObservationSource(value) {
  return OBSERVATION_SOURCES.includes(value);
}

class ExitIpObservationStore {
  constructor(storageDir, { fileName = 'exit-ip-observations.json', now = () => Date.now() } = {}) {
    if (!storageDir || typeof storageDir !== 'string') throw Error('Storage directory required');
    this.file = path.join(storageDir, fileName);
    this.now = now;
    this.entries = [];
    let raw = null;
    try { raw = fs.readFileSync(this.file, 'utf8'); } catch (_) { raw = null; }
    if (raw !== null) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(e => e && typeof e.profileId === 'string' &&
          typeof e.ip === 'string' && Number.isFinite(Date.parse(e.observedAt)));
      } else {
        // Never silently discard the only copy of the history: an
        // unparsable file (torn write, disk damage) is moved aside
        // for support and the store restarts empty, matching the
        // behaviour monitor's keep-corrupt-data policy.
        this.preserveCorrupt();
      }
    }
    this.prune();
  }

  preserveCorrupt() {
    try {
      const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
      let target = `${this.file}.corrupt-${stamp}`;
      for (let n = 2; fs.existsSync(target); n++) {
        target = `${this.file}.corrupt-${stamp}-${n}`;
      }
      fs.renameSync(this.file, target);
    } catch (_) { /* best-effort: starting empty still applies */ }
  }

  prune() {
    const cutoff = this.now() - MAX_AGE_MS;
    this.entries = this.entries
      .filter(e => Date.parse(e.observedAt) >= cutoff)
      .slice(-MAX_ENTRIES);
  }

  persist() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    // Atomic like Store.saveData and BehaviorMonitor.record: write a
    // temporary file, then rename it over the target. A crash or kill
    // mid-write leaves either the previous or the new complete file,
    // never a torn one.
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.entries), { mode: 0o600 });
    // mode above only applies on creation; enforce it on a reused
    // temp file too, or the rename publishes looser permissions
    // (R13 audit; same pattern as src/monitor/warningHistory.js).
    try { fs.chmodSync(temporary, 0o600); } catch (_) { /* best effort */ }
    fs.renameSync(temporary, this.file);
  }

  /**
   * Record one observation. Returns the stored entry, or null when the
   * input is not a usable observation (never throws on bad input: a
   * failed measurement must not break the caller's flow — it simply
   * produces no observation, and downstream warnings report
   * not_measured for that profile).
   */
  record({ profileId, ip, sessionId, source } = {}) {
    if (typeof profileId !== 'string' || !profileId) return null;
    if (typeof ip !== 'string' || !IPV4.test(ip)) return null;
    if (source !== undefined && source !== null && !isObservationSource(source))
      return null;
    const entry = {
      profileId, ip,
      observedAt: new Date(this.now()).toISOString(),
      sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
    };
    if (isObservationSource(source)) entry.source = source;
    this.entries.push(entry);
    this.prune();
    try { this.persist(); } catch (_) { /* recording is best-effort */ }
    return entry;
  }

  list() { return this.entries.slice(); }
}

module.exports = { ExitIpObservationStore, MAX_ENTRIES, MAX_AGE_MS, OBSERVATION_SOURCES, isObservationSource };
