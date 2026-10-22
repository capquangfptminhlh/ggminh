'use strict';
/**
 * Durable warning history (Constitution Sections 16, 20.3, 22).
 *
 * The warning service (src/monitor/warningService.js) keeps its
 * detection registry — firstDetectedAt / lastDetectedAt /
 * timesObserved per warning — in memory only, so every app restart
 * erased the answer to "when did this first appear, and how often
 * has it been observed since?". This store persists the NORMALISED
 * warnings (the six-question evidence records of Mục 22) to disk and
 * loads them back at startup.
 *
 * Privacy barrier (Mục 20.3) is structural, not conventional: every
 * record passes through a fixed whitelist projection before it can
 * reach the ledger or the file. Only the normalised warning fields
 * are stored — never raw behaviour events, never keystroke content,
 * passwords, clipboard, form content or page data. A caller handing
 * record() a polluted object cannot smuggle extra fields onto disk.
 *
 * Two counting modes, because there are two ways to wire the service:
 *   - 'delta' (default; works with the UNMODIFIED warningService):
 *     the service restarts its counters at 1 on every app run, so
 *     this store folds only the increments observed during the
 *     current process into the durable totals.
 *   - 'authoritative' (use together with the optional `seed` diff
 *     proposed in INTEGRATION-NOTES.md): the service is seeded from
 *     this store at startup, so its counters are already cumulative
 *     and are taken as authoritative (max semantics).
 *
 * Retention (Mục 20.3: bounded, published, deletable):
 *   - at most MAX_ENTRIES distinct warnings (safety cap — the real
 *     id space is bounded by ~17 codes x profile sets);
 *   - entries expire MAX_AGE_MS (90 days) after their LAST detection:
 *     long enough for a quarterly operational review ("when did this
 *     start?"), bounded unlike an ever-growing log. Raw inputs stay
 *     on their own shorter policies (behaviour events 24h, exit-IP
 *     observations 7 days); this ledger is the derived, minimal
 *     record of what was concluded from them.
 *   - clear() deletes the whole history at the user's request.
 *
 * Honesty (Mục 16): load() reports 'ok' | 'empty' | 'error'. A
 * corrupt or malformed file is an 'error' with NO entries trusted —
 * never a partial read dressed up as success, and nothing in this
 * module ever produces a pass/normal verdict. Persistence failures
 * are surfaced through record()/status(), never swallowed silently.
 */
const fs = require('fs');
const path = require('path');

const FILE_VERSION = 1;
const DEFAULT_FILE_NAME = 'warning-history.json';
const MAX_ENTRIES = 1000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const LEVELS = new Set(['high', 'medium', 'notice']);

function isRecord(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function isFiniteOrNull(x) { return x === null || Number.isFinite(x); }
function isStringArray(x) {
  return Array.isArray(x) && x.every(v => typeof v === 'string');
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

/**
 * The whitelist projection: the ONLY shape that may enter the ledger
 * or the file. Returns null when the input is not a usable normalised
 * warning. Detection bookkeeping (firstDetectedAt / lastDetectedAt /
 * timesObserved) is normalised here so partially-formed inputs get
 * conservative values derived from evaluatedAt.
 */
function projectWarning(w) {
  if (!isRecord(w)) return null;
  if (typeof w.id !== 'string' || !w.id) return null;
  if (typeof w.source !== 'string' || !w.source) return null;
  if (typeof w.code !== 'string' || !w.code) return null;
  if (!LEVELS.has(w.level)) return null;
  if (typeof w.title !== 'string') return null;
  if (!isRecord(w.observed)) return null;
  if (typeof w.observed.summary !== 'string') return null;
  if (!isStringArray(w.observed.profiles)) return null;
  if (!isStringArray(w.observed.sessionIds)) return null;
  if (!(w.observed.count === null || Number.isFinite(w.observed.count))) return null;
  if (w.observed.values !== undefined && !isRecord(w.observed.values)) return null;
  if (typeof w.method !== 'string' || !w.method) return null;
  if (typeof w.criterion !== 'string') return null;
  if (typeof w.limitation !== 'string' || !w.limitation) return null;
  if (!isStringArray(w.nextSteps)) return null;
  if (!isFiniteOrNull(w.windowFrom === undefined ? null : w.windowFrom)) return null;
  if (!isFiniteOrNull(w.windowTo === undefined ? null : w.windowTo)) return null;
  const evaluatedAt = Number.isFinite(w.evaluatedAt) ? w.evaluatedAt : null;
  const firstDetectedAt = Number.isFinite(w.firstDetectedAt)
    ? w.firstDetectedAt : evaluatedAt;
  const lastDetectedAt = Number.isFinite(w.lastDetectedAt)
    ? w.lastDetectedAt : evaluatedAt;
  if (!Number.isFinite(firstDetectedAt) || !Number.isFinite(lastDetectedAt)) return null;
  const timesObserved = Number.isInteger(w.timesObserved) && w.timesObserved > 0
    ? w.timesObserved : 1;
  return {
    id: w.id,
    source: w.source,
    code: w.code,
    level: w.level,
    title: w.title,
    observed: {
      summary: w.observed.summary,
      profiles: w.observed.profiles.slice(),
      sessionIds: w.observed.sessionIds.slice(),
      count: w.observed.count === undefined ? null : w.observed.count,
      values: w.observed.values ? clone(w.observed.values) : {},
    },
    windowFrom: w.windowFrom === undefined ? null : w.windowFrom,
    windowTo: w.windowTo === undefined ? null : w.windowTo,
    windowFromIso: typeof w.windowFromIso === 'string' ? w.windowFromIso : null,
    windowToIso: typeof w.windowToIso === 'string' ? w.windowToIso : null,
    evaluatedAt,
    evaluatedAtIso: typeof w.evaluatedAtIso === 'string' ? w.evaluatedAtIso : null,
    method: w.method,
    criterion: w.criterion,
    limitation: w.limitation,
    nextSteps: w.nextSteps.slice(),
    firstDetectedAt,
    lastDetectedAt,
    timesObserved,
  };
}

function createWarningHistory({
  storageDir,
  fileName = DEFAULT_FILE_NAME,
  now = () => Date.now(),
  maxEntries = MAX_ENTRIES,
  maxAgeMs = MAX_AGE_MS,
  countMode = 'delta',
} = {}) {
  if (!storageDir || typeof storageDir !== 'string')
    throw Error('storageDir is required');
  if (typeof now !== 'function') throw Error('now must be a function');
  if (!Number.isInteger(maxEntries) || maxEntries < 1)
    throw Error('maxEntries must be a positive integer');
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0)
    throw Error('maxAgeMs must be positive');
  if (countMode !== 'delta' && countMode !== 'authoritative')
    throw Error("countMode must be 'delta' or 'authoritative'");

  const file = path.join(storageDir, fileName);
  const ledger = new Map();       // id -> stored entry (durable totals)
  const folded = new Map();       // 'delta' mode: service-side count already folded
  let loadStatus = 'empty';       // 'ok' | 'empty' | 'error'
  let loadReason = null;
  let lastError = null;           // last persistence failure (Error.message)
  let hasLoaded = false;

  function prune() {
    const cutoff = now() - maxAgeMs;
    for (const [id, e] of ledger) {
      if (e.lastDetectedAt < cutoff) { ledger.delete(id); folded.delete(id); }
    }
    if (ledger.size > maxEntries) {
      const byOldest = [...ledger.values()]
        .sort((a, b) => a.lastDetectedAt - b.lastDetectedAt);
      for (const e of byOldest.slice(0, ledger.size - maxEntries)) {
        ledger.delete(e.id); folded.delete(e.id);
      }
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = JSON.stringify({
      version: FILE_VERSION,
      savedAt: new Date(now()).toISOString(),
      entries: [...ledger.values()],
    });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, payload, { mode: 0o600 });
    fs.renameSync(tmp, file);
    // rename keeps the tmp file's mode; enforce 0o600 explicitly in
    // case the tmp file pre-existed with wider permissions.
    try { fs.chmodSync(file, 0o600); } catch (_) { /* best effort */ }
  }

  /**
   * Load the ledger from disk. Returns {status, entries, reason?}.
   * 'error' trusts NOTHING from the file (fail closed, Mục 16) and
   * leaves the file itself untouched for inspection.
   */
  function load() {
    ledger.clear(); folded.clear(); lastError = null; hasLoaded = true;
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (error) {
      if (error && error.code === 'ENOENT') {
        loadStatus = 'empty'; loadReason = null;
        return { status: 'empty', entries: [] };
      }
      loadStatus = 'error';
      loadReason = 'Không đọc được file lịch sử cảnh báo: ' + error.message;
      return { status: 'error', entries: [], reason: loadReason };
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) {
      loadStatus = 'error';
      loadReason = 'File lịch sử cảnh báo không phải JSON hợp lệ.';
      return { status: 'error', entries: [], reason: loadReason };
    }
    if (!isRecord(parsed) || parsed.version !== FILE_VERSION ||
        !Array.isArray(parsed.entries)) {
      loadStatus = 'error';
      loadReason = 'File lịch sử cảnh báo có cấu trúc không đúng phiên bản kỳ vọng.';
      return { status: 'error', entries: [], reason: loadReason };
    }
    for (const item of parsed.entries) {
      const entry = projectWarning(item);
      if (!entry || entry.id !== item.id ||
          !Number.isInteger(item.timesObserved) || item.timesObserved < 1) {
        loadStatus = 'error';
        loadReason = 'File lịch sử cảnh báo chứa một mục không đúng định dạng đã chuẩn hoá.';
        ledger.clear();
        return { status: 'error', entries: [], reason: loadReason };
      }
      ledger.set(entry.id, entry);
    }
    prune();
    loadStatus = 'ok'; loadReason = null;
    return { status: 'ok', entries: entries() };
  }

  /**
   * Fold one service report (object with .warnings, as returned by
   * evaluate()/list()) or a bare warnings array into the ledger and
   * persist. Descriptive fields always take the latest detection's
   * values; firstDetectedAt keeps the earliest sighting; timesObserved
   * follows the configured countMode. Returns
   * {ok, recorded, rejected, count} or {ok:false, error, ...}.
   */
  function record(input) {
    if (!hasLoaded) load();
    const warnings = Array.isArray(input) ? input
      : isRecord(input) && Array.isArray(input.warnings) ? input.warnings
      : null;
    if (!warnings) {
      return { ok: false, recorded: 0, rejected: 0, count: ledger.size,
        error: 'record() expects a warning report or a warnings array' };
    }
    let recorded = 0, rejected = 0;
    for (const w of warnings) {
      const incoming = projectWarning(w);
      if (!incoming) { rejected++; continue; }
      const existing = ledger.get(incoming.id);
      if (!existing) {
        ledger.set(incoming.id, incoming);
        if (countMode === 'delta') folded.set(incoming.id, incoming.timesObserved);
      } else {
        if (countMode === 'delta') {
          const base = folded.get(incoming.id) || 0;
          const delta = incoming.timesObserved - base;
          if (delta > 0) existing.timesObserved += delta;
          folded.set(incoming.id, Math.max(base, incoming.timesObserved));
        } else {
          existing.timesObserved =
            Math.max(existing.timesObserved, incoming.timesObserved);
        }
        existing.firstDetectedAt =
          Math.min(existing.firstDetectedAt, incoming.firstDetectedAt);
        // Latest detection's descriptive state wins.
        const keep = {
          firstDetectedAt: existing.firstDetectedAt,
          timesObserved: existing.timesObserved,
        };
        Object.assign(existing, incoming, keep, {
          lastDetectedAt: Math.max(existing.lastDetectedAt, incoming.lastDetectedAt),
        });
      }
      recorded++;
    }
    prune();
    try {
      persist();
      lastError = null;
      return { ok: true, recorded, rejected, count: ledger.size };
    } catch (error) {
      lastError = String(error && error.message || error);
      return { ok: false, recorded, rejected, count: ledger.size, error: lastError };
    }
  }

  /** Current ledger entries (copies), most recently detected first. */
  function entries() {
    return [...ledger.values()]
      .sort((a, b) => b.lastDetectedAt - a.lastDetectedAt)
      .map(clone);
  }

  /**
   * Records in the exact shape the warning service registry holds —
   * the seed for the optional createWarningService({seed}) diff in
   * INTEGRATION-NOTES.md.
   */
  function seedRecords() { return entries(); }

  /**
   * Store status for surfacing next to the warning report. The
   * vocabulary deliberately avoids verdict words: a history store can
   * be ok/empty/error, never "pass" or "normal" (Mục 16).
   */
  function status() {
    return {
      // Once the ledger actually holds entries the store is reporting
      // live content, not its load-time state (defect R20-2: a fresh
      // install kept reporting 'empty' after the first record until
      // restart). An error still wins; an empty ledger still reports
      // the load outcome ('empty' or 'error').
      status: lastError ? 'error' : (ledger.size ? 'ok' : loadStatus),
      count: ledger.size,
      file,
      maxEntries,
      maxAgeMs,
      countMode,
      ...(loadReason ? { reason: loadReason } : {}),
      ...(lastError ? { reason: lastError } : {}),
    };
  }

  /**
   * Delete the entire history at the user's request (Mục 20.3):
   * clears memory and removes the file. A subsequent load() reports
   * 'empty'. Returns {ok} — a failed unlink is reported, not hidden.
   */
  function clear() {
    ledger.clear(); folded.clear();
    loadStatus = 'empty'; loadReason = null; lastError = null;
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(file + '.tmp', { force: true });
      return { ok: true };
    } catch (error) {
      lastError = String(error && error.message || error);
      return { ok: false, error: lastError };
    }
  }

  return { load, record, entries, seedRecords, status, clear, file };
}

module.exports = {
  createWarningHistory,
  projectWarning,
  WARNING_HISTORY_FILE: DEFAULT_FILE_NAME,
  WARNING_HISTORY_MAX_ENTRIES: MAX_ENTRIES,
  WARNING_HISTORY_MAX_AGE_MS: MAX_AGE_MS,
};
