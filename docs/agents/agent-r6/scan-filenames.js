'use strict';
/*
 * Agent R6 (release rehearsal): per-file manifest filename-legality scan
 * over a REAL engine tree, using the product's own rule —
 * fileName()/listFiles() from src/engine/bundledEngineManager.js.
 * The manifest rule (RELATIVE in bundledEngineManager.js): every path
 * segment must match ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$, total length <= 240,
 * no '.' or '..' segments. The production listFiles() throws on the
 * FIRST offending file; this scanner instead records a verdict for
 * EVERY file so release-day tree prep knows the full damage list.
 *
 * Usage: node scan-filenames.js <absoluteTreeRoot> <outDir>
 * Writes <outDir>/filename-verdicts.tsv and <outDir>/scan-summary.json.
 * Read-only: never modifies the scanned tree. No keys involved.
 */
const fs = require('fs');
const path = require('path');
const { fileName, listFiles } = require(path.join(__dirname, '..', '..', '..', 'src', 'engine', 'bundledEngineManager'));

const MAX_FILES = 10000;
const MAX_FILE_SIZE = 512 * 1024 * 1024;
const MAX_TOTAL_SIZE = 3 * 1024 * 1024 * 1024;
const SEGMENT = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;

function analyseFailure(rel) {
  const badSegments = [];
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '..') { badSegments.push({ segment: seg, reason: 'dot segment' }); continue; }
    if (!SEGMENT.test(seg)) {
      const badChars = [...new Set([...seg].filter(c => !/[a-zA-Z0-9_.-]/.test(c)))];
      const badStart = !/^[a-zA-Z0-9_]/.test(seg);
      badSegments.push({
        segment: seg,
        reason: [
          badChars.length ? 'illegal characters: ' + badChars.map(c => JSON.stringify(c)).join(' ') : null,
          badStart ? 'segment does not start with [A-Za-z0-9_]' : null,
        ].filter(Boolean).join('; '),
        badChars,
      });
    }
  }
  if (rel.length > 240) badSegments.push({ segment: '(whole path)', reason: 'path length ' + rel.length + ' > 240' });
  return badSegments;
}

function main() {
  const root = process.argv[2];
  const outDir = process.argv[3];
  if (!root || !path.isAbsolute(root) || !outDir) {
    console.error('usage: node scan-filenames.js <absoluteTreeRoot> <outDir>');
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  const symlinks = [];
  const others = [];
  let fileCount = 0, totalBytes = 0, largest = { path: null, bytes: 0 };
  (function visit(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.lstatSync(full);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (stat.isSymbolicLink()) { symlinks.push(rel); continue; }
      if (stat.isDirectory()) { visit(full); continue; }
      if (!stat.isFile()) { others.push(rel); continue; }
      fileCount++;
      totalBytes += stat.size;
      if (stat.size > largest.bytes) largest = { path: rel, bytes: stat.size };
      let verdict = 'PASS', reason = '';
      try { fileName(rel); } catch (_) {
        verdict = 'FAIL';
        reason = analyseFailure(rel).map(s => `[${s.segment}] ${s.reason}`).join(' | ');
      }
      rows.push({ path: rel, bytes: stat.size, verdict, reason });
    }
  })(root);
  rows.sort((a, b) => (a.path < b.path ? -1 : 1));
  const failures = rows.filter(r => r.verdict === 'FAIL');
  const lowerSeen = new Map(); const ciDuplicates = [];
  for (const r of rows) {
    const k = r.path.toLowerCase();
    if (lowerSeen.has(k)) ciDuplicates.push({ kept: lowerSeen.get(k), duplicate: r.path });
    else lowerSeen.set(k, r.path);
  }
  let listFilesOutcome;
  try {
    const listed = listFiles(root);
    listFilesOutcome = { ok: true, listedCount: listed.length };
  } catch (error) {
    listFilesOutcome = { ok: false, error: error.message };
  }
  const tsv = ['path\tbytes\tverdict\treason']
    .concat(rows.map(r => `${r.path}\t${r.bytes}\t${r.verdict}\t${r.reason}`)).join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'filename-verdicts.tsv'), tsv);
  const summary = {
    treeRoot: root,
    fileCount, totalBytes,
    totalMiB: +(totalBytes / 1048576).toFixed(1),
    largestFile: largest,
    passCount: rows.length - failures.length,
    failCount: failures.length,
    failures: failures.map(f => ({ path: f.path, bytes: f.bytes, analysis: analyseFailure(f.path) })),
    symlinks, unsupportedEntries: others,
    caseInsensitiveDuplicates: ciDuplicates,
    hasEntryExecutable: rows.some(r => r.path === 'camoufox.exe'),
    hasTopLevelManifestJson: rows.some(r => r.path === 'manifest.json'),
    limits: {
      maxFiles: { limit: MAX_FILES, actual: fileCount, ok: fileCount <= MAX_FILES },
      maxFileSize: { limit: MAX_FILE_SIZE, actual: largest.bytes, ok: largest.bytes <= MAX_FILE_SIZE },
      maxTotalSize: { limit: MAX_TOTAL_SIZE, actual: totalBytes, ok: totalBytes <= MAX_TOTAL_SIZE },
    },
    productionListFiles: listFilesOutcome,
  };
  fs.writeFileSync(path.join(outDir, 'scan-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    fileCount, totalBytes, pass: summary.passCount, fail: summary.failCount,
    symlinks: symlinks.length, ciDuplicates: ciDuplicates.length,
    listFilesOk: listFilesOutcome.ok,
  }));
}
main();
