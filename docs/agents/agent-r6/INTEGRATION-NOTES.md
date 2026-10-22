# INTEGRATION NOTES — Agent R6 (engine distribution rehearsal)

For the coordinator. Full detail: `RUN-REPORT.md` in this directory.

## Headline

The OFFICIAL Windows Camoufox tree (v156.0.1-beta.36, digest verified
against the repo pin) **cannot be signed as-is**: the manifest
filename rule refuses 218 of 1,579 files — all fonts under `fonts/`
(spaces, `[`/`]`, `,`, non-ASCII names) — and the production signing
CLI fails closed on the pristine tree (exit 1, "Unsafe bundled engine
relative file path"). An owner decision is required BEFORE any real
release signing; options A–D with trade-offs are documented in
RUN-REPORT.md. The rule was NOT loosened and no product code changed.

## What was proven

- Upstream provenance flow works exactly as the repo's staging script
  assumes (size + SHA-256 match the pin byte-for-byte).
- With a rehearsal-only mechanical rename of the 218 files (mapping
  table committed), the FULL pipeline passes at real scale: sign
  (1,579 files / 2,563,096,877 B) → verify under publisher key →
  license-key refusal → package (1,355,084,308 B, SHA-256
  `5e76c5a319aa47796254ca24a6e070429e5633af5a50e47d53e4d0991b9cb5bd`)
  → validateRelease → install via real downloadPinned + contract
  seam → alreadyPresent → installed-tree verification.
- Still NOT_RUN (Gate 3, owner Windows): production PE inspection,
  PowerShell extractor, and whether the engine enumerates renamed
  fonts correctly at runtime.

## Files added (all under docs/agents/agent-r6/, docs-only)

- `RUN-REPORT.md`, `RELEASE-DAY-CHECKLIST.md`, this file.
- `scan-filenames.js` — per-file legality scanner (uses the product's
  own `fileName()`); proposed as a permanent release-day gate via the
  checklist, NOT wired into the npm test chain (needs a GB-scale
  fixture; chain membership is a coordinator decision).
- `rehearse-pipeline.js` — the rehearsal driver (throwaway keys in
  tmpdir, shredded in a finally block).
- Evidence: `filename-verdicts.tsv`, `scan-summary.json`,
  `rename-mapping.json`, `pipeline-results-pristine.json`,
  `pipeline-results-prepared.json`.

## Key hygiene

Throwaway Ed25519 pairs only (three ceremonies total across runs —
pristine attempt, aborted script run, final run); every pair was
overwritten and deleted by the scripts; pre-commit scan of this
directory for PEM private-key headers: 0 hits. No production key was
generated or held. Rehearsal trees/packages live outside the repo at
`~/tmp-big/r6/` (upstream/, tree-prepared/, work-prepared2/); no
binaries committed.

## Suggested coordinator actions

1. Surface the 218-font decision to the owner together with QD-02
   (publisher key) — release signing is blocked on both.
2. If option A (rename at prep) is chosen, Gate 3 acceptance must add
   a font-enumeration check on the installed engine (already written
   into the checklist, step 9).
3. Adopt `RELEASE-DAY-CHECKLIST.md` as the operating document for
   the first commercial engine release.
