# Agent R3 — INTEGRATION-NOTES (Wave R, Gate 3 acceptance pack)

## Delivered

- `docs/acceptance/gate-3-wave2.md` (new) — the complete
  owner-executable Gate 3 acceptance pack for the Wave-2 tree.
  Docs only; no code, no workflow, no package.json changes.

## What the pack is bound to (§23)

- Source tree: integration head `f280296` (this branch's base).
- Artifact: GitHub snapshot `f549a63`, CI run `39641363889`
  (Success), artifact `LHM-Ads-Browser-Windows-x64`, ZIP digest
  `sha256:8e5ca8a6…`, inner installer
  `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`, 89,473,785
  bytes, SHA-256 `54aec523…f7c4e383b497`. Step G3-01 makes the
  owner re-verify size + hash on the acceptance machine and
  stops the whole run on any mismatch.

## Coverage, in the mandated order

Download + hash verification (G3-01) → install with SmartScreen
recording for the unsigned EXE + Defender scan outcome (G3-02)
→ first run + trial state incl. the 10-profile trial cap
(G3-03) → Chromium create/open/close/reopen in native mode
(G3-04) → Camoufox create + provisioning-state capture +
fail-closed open (G3-05), with a conditional full branch
G3-05B that is pre-declared NOT_RUN until an LHM-signed
Camoufox release exists → proxy HTTP + SOCKS5 in-session,
broken-proxy refusal, direct/PREFLIGHT_ONLY observation
(G3-06) → license activate / tampered-token / renew /
revoke (with the offline-revocation limit recorded as an
observation, not a pass) / deactivate-returns-to-remaining-
trial (G3-07) → config backup/restore round-trip incl.
wrong-password refusal and a plaintext-proxy-password scan of
the backup file (G3-08) → delete + permanent purge with a
four-root inventory plus the F3 session-snapshots leftover and
F4 dangling workflow references recorded as published open
items (G3-09) → update: license verification-server check
(G3-10a, executable) and app update check (G3-10b, pre-declared
NOT_RUN — see below) → uninstall + residue inventory against
the documented default (G3-11). Appendix A carries the old
guide's two-sided measurements (isolation run, browser-vs-
server snapshots, DNS lab, WebRTC/WebGL on a real machine) as
optional, non-gating items feeding §23 records and the Gate 2
remainder. A copy-ready summary table + sign-off block close
the pack, including the mandatory scope sentence and the list
of published leftovers that must accompany any ĐẠT verdict.

## Product facts verified against this tree before writing

- Installer name pattern from `package.json` build.nsis
  (`artifactName`), version `5.8.0`; `nsis.deleteAppDataOnUninstall`
  is **absent** → default keeps app data; G3-11 is written to
  verify that documented behaviour, including the fail case
  where uninstall deletes MORE than the customer guide
  promises.
- Packaged engine staging dirs contain only `README.md`
  (`resources/bundled-engines`, `resources/camoufox-engine`) →
  the pack's standard expectation for Camoufox is the honest
  no-engine path (provisioning `unavailable` / fail-closed
  open), not a working engine.
- App update check is **not wired** into the shipped UI:
  `src/update/updateCheck.js` exists, but there is no
  `check-for-update` IPC in `main.js`/`preload.js` (grep
  verified). Hence G3-10b is a recording step with a
  pre-declared NOT_RUN, not an invented click-path.
- License deactivate exists in the installed UI
  (`src/ui/index.html` button "Xóa license trên máy này",
  `src/licensing/manager.js deactivate()`); the pack's
  expectation (return to remaining trial from first install,
  not a fresh 30 days) follows Agent 18's verified matrix.
- Session snapshots live at `store.baseDir/session-snapshots`
  (`src/ops/sessionSnapshots.js`); workflows at
  `automation-workflows.json` (`src/automation/studio.js`) —
  the F3/F4 inventory paths in G3-09 match the code.
- Proxy check entry points corrected during writing: the
  "Kiểm tra kết nối Proxy" button is in the profile form's
  Proxy & Network tab (`btn-test-proxy`); Proxy Center has its
  own batch check (`pc-check-batch`). G3-06 names both.

## Relation to the previous guide

`~/workspace/ggminh-analysis/huong-dan-do-windows-thuc-te.md`
measured from a source checkout of the selective branch with a
standalone Camoufox binary. This pack supersedes that flow for
Gate 3: the object under test is the installed CI artifact,
and the old Parts A–D survive as preconditions thinking
(hash-verify your engine from its official source, never from
a chat report) and as Appendix A's optional measurements.

## §11 self-scan

The pack states Preview status up front, promises no platform
outcomes, phrases every expectation as the product's own
documented behaviour, and forbids "đã xóa sạch toàn bộ"-style
wording where F3/F4 stand. Full-text scan for banned absolutes
was run before commit (see commit-time check in the branch
history notes): no "100%", no safety guarantees, competitor
names absent.

## Nothing else touched

No other files modified. No push, no merge, no tag.
