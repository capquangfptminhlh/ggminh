'use strict';
/**
 * Per-profile measurement record store (Constitution Sections 16, 23;
 * contract: docs/agents/agent-9/INTEGRATION-NOTES.md, "Hồ sơ đo").
 *
 * Agent 9 built the checklist provider and its Section-23 validity
 * gate, but no producer existed: no store, no IPC, no per-profile
 * measurement step, so the three stage-0 criteria (storage-isolation,
 * self-consistency, pinned-identity) could only ever render CHƯA ĐO.
 * This module is the storage half of that missing producer:
 *
 *  - `measurement-records.json` in the app storage directory holds ONE
 *    record per profile (newest wins). Records are NOT pruned by age:
 *    an expired record must still reach the provider gate so the
 *    checklist can name the concrete reason ("quá hạn 30 ngày")
 *    instead of a generic "no record".
 *  - The write path mirrors the fixed exit-IP store pattern
 *    (src/health/exitIpObservations.js): atomic temporary-file +
 *    rename at mode 0o600, and a file that cannot be parsed is
 *    preserved as a `.corrupt-<timestamp>` sibling — never silently
 *    discarded. The load outcome is REPORTED via `status()` (and the
 *    entries dropped at load for failing shape validation are
 *    counted there), so a damaged evidence file is visible to
 *    support instead of vanishing.
 *  - Write-time validation is SHAPE validation only
 *    (`validateMeasurementRecord`): format/version, required
 *    bindings present (§23: profile, time, app commit, engine hash),
 *    and the two result blocks well-formed. BINDING enforcement —
 *    record age, accepted tiers, commit/engine match against the
 *    running app — belongs to the provider's validity gate, which
 *    owns the current context and produces the user-facing reason.
 *    Keeping one enforcement point means imported records (data
 *    source seam) and stored records are judged identically.
 */
const fs = require('fs');
const path = require('path');

const RECORD_FORMAT = 'lhm-profile-measurement';
const RECORD_VERSION = 1;
const RECORD_TIERS = Object.freeze(['real-engine', 'installed-exe']);
const ISOLATION_CONDITIONS = Object.freeze(['baselineClassic', 'concurrentCrossWrite',
  'crashRecovery', 'crashRecoveryIdleFlush', 'httpCache', 'faviconCache']);
const CONDITION_VALUES = Object.freeze(['pass', 'fail', 'not_run']);
const SHA256_HEX = /^[a-f0-9]{64}$/i;

function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function isNonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }

/**
 * Shape-validate one record against the lhm-profile-measurement v1
 * contract. Returns null when the shape is usable, otherwise a
 * concrete Vietnamese reason (same wording family as the provider
 * gate) naming the first violation found.
 */
function validateMeasurementRecord(record) {
  if (!isPlainObject(record)) return 'Hồ sơ đo không phải một đối tượng JSON hợp lệ.';
  if (record.format !== RECORD_FORMAT || record.version !== RECORD_VERSION) {
    return 'Hồ sơ đo không đúng định dạng ' + RECORD_FORMAT + ' v' + RECORD_VERSION +
      ' (format=' + String(record.format) + ', version=' + String(record.version) + ').';
  }
  if (!isNonEmptyString(record.profileId)) return 'Hồ sơ đo thiếu profileId của hồ sơ được đo.';
  if (!Number.isFinite(Date.parse(record.measuredAt))) {
    return 'Hồ sơ đo thiếu thời điểm đo hợp lệ (measuredAt).';
  }
  if (!isNonEmptyString(record.appCommit)) {
    return 'Hồ sơ đo không gắn commit ứng dụng (Mục 23 yêu cầu mọi kết quả đo gắn với commit).';
  }
  if (!isPlainObject(record.engine) || !isNonEmptyString(record.engine.sha256) ||
      !SHA256_HEX.test(record.engine.sha256)) {
    return 'Hồ sơ đo không gắn hash SHA-256 hợp lệ của engine đã đo (Mục 23).';
  }
  if (record.engine.version !== undefined && !isNonEmptyString(record.engine.version)) {
    return 'Hồ sơ đo có phiên bản engine không hợp lệ (engine.version).';
  }
  if (!isNonEmptyString(record.os)) return 'Hồ sơ đo thiếu hệ điều hành nơi đo (os).';
  if (!isNonEmptyString(record.tier)) return 'Hồ sơ đo thiếu tầng đo (tier).';
  if (!isNonEmptyString(record.method)) return 'Hồ sơ đo thiếu mô tả cách đo (method).';
  if (!isPlainObject(record.results)) return 'Hồ sơ đo thiếu khối kết quả (results).';

  const cfg = record.results.configured;
  if (!isPlainObject(cfg)) return 'Hồ sơ đo thiếu khối kết quả đo có cấu hình (results.configured).';
  const cfgProblem = validateResultBlock(cfg, 'đo có cấu hình');
  if (cfgProblem) return cfgProblem;
  if (cfg.status === 'measured') {
    const ident = cfg.identity;
    if (!isPlainObject(ident) || !Number.isInteger(ident.compared) || ident.compared < 0 ||
        !Number.isInteger(ident.matched) || ident.matched < 0 || ident.matched > ident.compared ||
        !Array.isArray(ident.mismatches)) {
      return 'Khối so kỳ vọng danh tính (configured.identity) không đúng dạng: cần compared/matched nguyên không âm, matched ≤ compared và mismatches là mảng.';
    }
    const cons = cfg.consistency;
    if (!isPlainObject(cons) || !Number.isInteger(cons.checked) || cons.checked < 0 ||
        !Array.isArray(cons.inconsistent)) {
      return 'Khối tự nhất quán (configured.consistency) không đúng dạng: cần checked nguyên không âm và inconsistent là mảng.';
    }
  }

  const iso = record.results.isolation;
  if (!isPlainObject(iso)) return 'Hồ sơ đo thiếu khối kết quả cách ly (results.isolation).';
  const isoProblem = validateResultBlock(iso, 'cách ly');
  if (isoProblem) return isoProblem;
  if (iso.status === 'measured') {
    if (!isPlainObject(iso.conditions)) {
      return 'Khối điều kiện cách ly (isolation.conditions) không đúng dạng.';
    }
    for (const [key, value] of Object.entries(iso.conditions)) {
      if (!ISOLATION_CONDITIONS.includes(key)) {
        return 'Điều kiện cách ly không thuộc hợp đồng: ' + key + '.';
      }
      if (!CONDITION_VALUES.includes(value)) {
        return 'Giá trị điều kiện cách ly ' + key + ' không hợp lệ: ' + String(value) +
          ' (chỉ chấp nhận pass|fail|not_run).';
      }
    }
    if (iso.pairedProfileId !== undefined && iso.pairedProfileId !== null &&
        !isNonEmptyString(iso.pairedProfileId)) {
      return 'isolation.pairedProfileId không hợp lệ.';
    }
  }
  return null;
}

function validateResultBlock(block, label) {
  if (block.status !== 'measured' && block.status !== 'error') {
    return 'Khối kết quả ' + label + ' có status không hợp lệ: ' + String(block.status) +
      ' (chỉ chấp nhận measured|error).';
  }
  if (block.status === 'error' && !isNonEmptyString(block.reason)) {
    return 'Khối kết quả ' + label + ' ở trạng thái error nhưng thiếu lý do (reason).';
  }
  return null;
}

/**
 * Assemble a contract-shaped record (the producer-side builder used
 * by tools/measure-profile.js; the main process can reuse it when an
 * in-app measurement step lands). Throws on shape violations so a
 * producer bug surfaces at production time, not at checklist time.
 */
function assembleRecord({ profileId, measuredAt, appCommit, engine, os, environment,
  tier, method, configured, isolation } = {}) {
  const record = {
    format: RECORD_FORMAT,
    version: RECORD_VERSION,
    profileId,
    measuredAt: measuredAt || new Date().toISOString(),
    appCommit,
    engine: engine || {},
    os,
    environment: environment || '',
    tier,
    method,
    results: { configured, isolation },
  };
  const problem = validateMeasurementRecord(record);
  if (problem) throw Error('Refusing to assemble an invalid measurement record: ' + problem);
  return record;
}

class MeasurementRecordStore {
  constructor(storageDir, { fileName = 'measurement-records.json', now = () => Date.now() } = {}) {
    if (!storageDir || typeof storageDir !== 'string') throw Error('Storage directory required');
    this.file = path.join(storageDir, fileName);
    this.now = now;
    this.records = [];
    this.invalidEntryCount = 0;
    this.loadResult = { status: 'empty' };
    let raw = null;
    try { raw = fs.readFileSync(this.file, 'utf8'); } catch (_) { raw = null; }
    if (raw !== null) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (validateMeasurementRecord(entry) === null) this.records.push(entry);
          else this.invalidEntryCount++;
        }
        this.loadResult = { status: 'ok', count: this.records.length };
        if (this.invalidEntryCount > 0) {
          // Reported, never silent: entries that fail the contract
          // shape are dropped from the working set and counted here;
          // the on-disk file is left untouched until the next save.
          this.loadResult.invalidDropped = this.invalidEntryCount;
        }
      } else {
        // Never silently discard the only copy of the evidence: an
        // unparsable file is moved aside for support (same policy as
        // the exit-IP store and the behaviour monitor) and the load
        // outcome is reported through status().
        const preserved = this.preserveCorrupt();
        this.loadResult = {
          status: 'error',
          reason: 'measurement-records.json could not be parsed; preserved as ' +
            (preserved || 'a .corrupt sibling') + ' and the store restarted empty',
          preservedFile: preserved,
        };
      }
    }
  }

  preserveCorrupt() {
    try {
      const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
      let target = `${this.file}.corrupt-${stamp}`;
      for (let n = 2; fs.existsSync(target); n++) {
        target = `${this.file}.corrupt-${stamp}-${n}`;
      }
      fs.renameSync(this.file, target);
      return path.basename(target);
    } catch (_) { return null; /* best-effort: starting empty still applies */ }
  }

  persist() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    // Atomic like the exit-IP store: write a temporary file, then
    // rename it over the target — a crash mid-write leaves either
    // the previous or the new complete file, never a torn one. A
    // stale temp from an earlier crash is removed first so the
    // 0o600 creation mode always applies to a fresh inode.
    const temporary = this.file + '.tmp';
    try { fs.unlinkSync(temporary); } catch (_) { /* no stale temp */ }
    fs.writeFileSync(temporary, JSON.stringify(this.records, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  /**
   * Store one record, replacing any previous record for the same
   * profile (the gate judges the newest measurement; age and
   * binding enforcement happen in the provider). Returns
   * { ok: true, record } or { ok: false, reason } — a malformed
   * record is refused, never persisted.
   */
  save(record) {
    const problem = validateMeasurementRecord(record);
    if (problem) return { ok: false, reason: problem };
    const stored = JSON.parse(JSON.stringify(record));
    const existing = this.records.findIndex(r => r.profileId === stored.profileId);
    if (existing >= 0) this.records[existing] = stored;
    else this.records.push(stored);
    this.persist();
    return { ok: true, record: stored };
  }

  getForProfile(profileId) {
    const found = this.records.find(r => r.profileId === profileId);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  /**
   * Remove the record bound to a profile (permanent-deletion surface:
   * wired to the Store's onProfilePurged hook in main.js, alongside
   * the automation-workflow sweep). Returns the number removed (0|1 —
   * the store keeps at most one record per profile). Persists only
   * when something was actually removed.
   */
  forgetProfile(profileId) {
    const before = this.records.length;
    this.records = this.records.filter(r => r.profileId !== profileId);
    const removed = before - this.records.length;
    if (removed > 0) this.persist();
    return removed;
  }

  list() { return JSON.parse(JSON.stringify(this.records)); }

  status() {
    return {
      load: this.loadResult,
      count: this.records.length,
      invalidDropped: this.invalidEntryCount,
      file: this.file,
    };
  }
}

module.exports = {
  MeasurementRecordStore,
  validateMeasurementRecord,
  assembleRecord,
  RECORD_FORMAT,
  RECORD_VERSION,
  RECORD_TIERS,
  ISOLATION_CONDITIONS,
};
