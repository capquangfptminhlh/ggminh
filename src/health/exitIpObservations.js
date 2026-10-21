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
 * at most 7 days old. The file is written with mode 0o600.
 */
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 20000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

class ExitIpObservationStore {
  constructor(storageDir, { fileName = 'exit-ip-observations.json', now = () => Date.now() } = {}) {
    if (!storageDir || typeof storageDir !== 'string') throw Error('Storage directory required');
    this.file = path.join(storageDir, fileName);
    this.now = now;
    this.entries = [];
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(e => e && typeof e.profileId === 'string' &&
          typeof e.ip === 'string' && Number.isFinite(Date.parse(e.observedAt)));
      }
    } catch (_) { this.entries = []; }
    this.prune();
  }

  prune() {
    const cutoff = this.now() - MAX_AGE_MS;
    this.entries = this.entries
      .filter(e => Date.parse(e.observedAt) >= cutoff)
      .slice(-MAX_ENTRIES);
  }

  persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.entries), { mode: 0o600 });
  }

  /**
   * Record one observation. Returns the stored entry, or null when the
   * input is not a usable observation (never throws on bad input: a
   * failed measurement must not break the caller's flow — it simply
   * produces no observation, and downstream warnings report
   * not_measured for that profile).
   */
  record({ profileId, ip, sessionId } = {}) {
    if (typeof profileId !== 'string' || !profileId) return null;
    if (typeof ip !== 'string' || !IPV4.test(ip)) return null;
    const entry = {
      profileId, ip,
      observedAt: new Date(this.now()).toISOString(),
      sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
    };
    this.entries.push(entry);
    this.prune();
    try { this.persist(); } catch (_) { /* recording is best-effort */ }
    return entry;
  }

  list() { return this.entries.slice(); }
}

module.exports = { ExitIpObservationStore, MAX_ENTRIES, MAX_AGE_MS };
