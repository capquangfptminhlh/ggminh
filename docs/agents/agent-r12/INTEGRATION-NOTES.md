# Agent R12 — Integration notes for the coordinator

Companion to `RECONCILIATION.md` in this directory. Base: `f280296`.
Nothing in this branch changes product code; the only proposed code change
is the item-3 diff below, for the coordinator to apply (or to supersede
with the owner's original patch — see the preference rule there).

## Item 1 — `89b3c2c`: BLOCKED, artefact request to the owner

The owner's local checkout is not present on this machine and the commit is
in no local object store (evidence in RECONCILIATION.md). Ask the owner to
produce **one** of the following from that checkout:

```bash
# Option A (preferred): a bundle carrying the commit and its history
git bundle create lhm-local-stream.bundle 89b3c2c
# plus the two uncommitted changes as patches:
git diff > lhm-local-uncommitted.patch            # unstaged
git diff --cached > lhm-local-staged.patch        # if anything is staged

# Option B: push the commit to a scratch branch (e.g. owner/local-89b3c2c)
# and commit or stash-export the two uncommitted changes the same way.
```

On receipt: import into a scratch clone, diff `89b3c2c` against its merge
base with `f280296`, and re-run this reconciliation for the committed part
only. Until then, treat any claim that a tree "includes the owner's local
work" as unverified.

## Item 2 — Signing fix: NO code action

Both gaps (separate Camoufox publisher key; private keys blocked in engine
packages) are already covered in the integrated tree, more broadly than the
owner's reported fix (sign-time **and** verify-time; install-service guard
wired at `main.js:841,846`). Verified for this report:
`test/camoufox-engine-source-hardening.js` PASS and
`test/camoufox-engine-distribution.js` PASS at `f280296` — the coordinator
does not need to re-run them for this item.

- Tell the owner their signing change can be discarded at their next sync.
- Optional cheap insurance if the item-1 artefact arrives: byte-diff their
  signing-tool change against `e72991b`'s; only if it contains behaviour
  beyond the two-line description should any slice be ported.
- The Chromium license-key fallback (`tools/sign-bundled-engine.js:63`) is
  **QD-02's** subject, not this item's — it closes only by the owner's
  QD-02 decision, not by anything in the local stream.

## Item 3 — Single-instance lock: adoption diff (RECONSTRUCTION)

The integrated tree has no single-instance protection; the owner's version
is better by existence. Their literal diff is unavailable (item 1), so the
diff below is a reconstruction of the described behaviour against `main.js`
at `f280296`, written to this codebase's actual init order.
**Preference rule:** if the owner supplies their original patch, diff the
two and prefer the owner's wherever they differ — their init-order tests
encode decisions not visible here.

```diff
diff --git a/main.js b/main.js
index de42b93..6250522 100644
--- a/main.js
+++ b/main.js
@@ -783,11 +783,32 @@ function initIPC() {
   });
 }
 
+// Fired on the PRIMARY instance when a second launch is attempted against
+// the same userData directory: surface the existing window instead of
+// letting the second process run (it quits in its own whenReady guard).
+app.on('second-instance', () => {
+  if (mainWindow) {
+    if (mainWindow.isMinimized()) mainWindow.restore();
+    mainWindow.focus();
+  }
+});
 app.whenReady().then(async () => {
   if (process.env.LHM_CI_UI_CAPTURE === '1') {
     app.setPath('userData', path.join(os.tmpdir(), 'lhm-ui-ci-' + process.pid));
   }
   const storageDir = path.join(app.getPath('userData'), 'storage');
+  // Single-instance guard: a second LHM process on this userData directory
+  // would load its own in-memory copy of db.json (Store loads once and
+  // rewrites the whole file per save) and silently overwrite this
+  // instance's changes on every save, act on stale state for deletions,
+  // and collide on the Local API port. The lock is keyed by Electron to
+  // the userData path, so it is taken AFTER the CI-capture setPath above
+  // (each CI capture owns a per-PID data store and must not be blocked)
+  // and BEFORE the legacy migration and Store construction below.
+  if (!app.requestSingleInstanceLock()) {
+    app.quit();
+    return;
+  }
   const legacyDir = path.join(__dirname, 'data');
   if (!fs.existsSync(path.join(storageDir, 'db.json')) &&
       fs.existsSync(path.join(legacyDir, 'db.json'))) {
```

This diff was **generated mechanically** for this report: the edit was
applied to a throwaway worktree of `f280296`, `git diff` was captured, and
the worktree was discarded — the r12 branch itself carries no code change.
The edited `main.js` passes `node --check`, and the ordering was verified
in the edited file: CI-capture `setPath` → `requestSingleInstanceLock()` →
legacy migration → `new Store(...)`. To apply: save the block above as a
patch and `git apply` it on the integration branch (it applies against
`main.js` blob `de42b93`).

Notes for whoever applies it:

- `mainWindow` is declared at `main.js:61` (`let mainWindow = null;`), above
  both hunks — the handler is safe as written.
- Do **not** move the lock call to module top level: the CI UI-capture mode
  (`main.js:787–789`) deliberately gives each capture process its own
  userData directory; a top-level lock is taken against the *default*
  userData path before `setPath` runs and would make parallel CI captures
  block each other.
- Suggested test coverage, mirroring the owner's "init-order" intent:
  static wiring assertions in the style of `test/integration-wiring.js` —
  (a) `requestSingleInstanceLock` appears in `main.js` before
  `new Store(` and before the legacy-migration block; (b) it appears after
  the `LHM_CI_UI_CAPTURE` `setPath` line; (c) a `second-instance` handler is
  registered. Register the test in the `package.json` chain next to
  `integration-wiring`.
- Behavioural acceptance is still owed **either way** (the owner's own
  caveat): install the EXE, launch it twice, confirm the second launch
  exits and the first window is focused, and confirm a profile edit made in
  the surviving instance persists. Add to the Gate-3 pack.
- Out of scope for this diff: multi-*machine* sharing of one store (the
  store is a local directory; nothing here speaks to network-shared
  storage), and any change to Store's whole-file persistence model — the
  lock removes the second writer, which is the hazard the owner targeted.
