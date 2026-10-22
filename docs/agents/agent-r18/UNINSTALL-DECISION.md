# DECISION PAPER — what uninstall should do with customer data

For: the owner. Question: when a customer uninstalls LHM Ads Browser,
what happens to the data the app stored on their machine?

## Where the data lives

Everything the app owns sits under one tree — Electron's userData,
`%APPDATA%\LHM Ads Browser\` — including `storage/` (profile store
`db.json`, license activation + trial state, warning history, exit-IP
observations, behaviour events) and the per-profile browser data roots
(cookies, localStorage, sessions). Encrypted backups or snapshots the
customer **exported to a folder of their choosing** live outside this
tree and are never touched by any option below.

## Current state (never explicitly decided)

`nsis.deleteAppDataOnUninstall` is not set in package.json, so the
electron-builder default applies: **false**. Uninstall removes the
program files (the `%LOCALAPPDATA%\Programs\` tree, shortcuts, registry
uninstall entry) and **leaves the entire user-data tree on disk,
indefinitely**. The customer guide already describes this honestly.
Agent 17 verified the related deletion paths inside the app; the
uninstaller itself is config-only analysis (NOT_RUN on real Windows).

## Option A — Keep data on uninstall (current default)

Set nothing (or explicitly `deleteAppDataOnUninstall: false`).

- Accidental uninstall, a failed update, or a support-guided reinstall
  loses **nothing**: profiles, sessions and the license activation all
  survive; reinstalling just works.
- Cost: "I uninstalled it" ≠ "my data is gone". For a product whose
  customers run many ad accounts, leftover browser profiles contain
  live session data the customer may believe was removed. The seller
  must keep telling customers to delete `%APPDATA%\LHM Ads Browser\`
  manually for a full removal (the guide already does).
- Disk: profile data can be large; it stays until manually removed.

## Option B — Always delete data on uninstall

Set `nsis.deleteAppDataOnUninstall: true`. The uninstaller removes the
userData tree as part of uninstall.

- Clean, promise-able exit: uninstall = the app and its local data are
  gone (exported backups aside — the guide must keep saying so, or the
  promise is false).
- Cost: **any** uninstall is total local data loss — all profiles and
  sessions, the license activation state, and the trial record. A
  customer who uninstalls "to fix a problem" on support advice destroys
  the very data support needed. Reinstall requires the license token
  again (machine binding still validates; the seller re-sends the
  token per the runbook flow).
- If this option is ever chosen, two companions are mandatory: the
  customer guide must warn **before** the uninstall steps (R7's file),
  and the app should nudge an encrypted backup before uninstalling —
  that nudge does not exist today (feature proposal, not built).

## Option C — Ask at uninstall time (middle option)

electron-builder has **no built-in prompt** for app data — the setting
is a plain boolean. The prompt is achievable through electron-builder's
supported extension point: a custom NSIS include (`build.nsis.include`)
adding a custom uninstall macro that shows a Yes/No dialog
("Remove LHM Ads Browser data — profiles, sessions and license state —
from this machine?") and deletes the userData tree only on Yes.

- The default button must be **No** (keep), and a **silent uninstall**
  (`/S`, used by some IT tooling and updaters) must never block on the
  dialog — the script must detect silent mode and default to keep.
- Cost: custom installer code in the release path. It must be exercised
  on real Windows across interactive uninstall, silent uninstall, and
  reinstall-over-existing-data before it can be trusted (Gate 3 items).
  A buggy uninstall script is worse than either simple option.
- Benefit: the customer decides at the moment it matters, with the
  safe default preselected.

## Recommendation

**Option A for the first commercial release** — with manual,
seller-assisted support, surviving an accidental uninstall is worth
more than uninstall tidiness, and the leftover-data caveat is already
documented in the customer guide. **Revisit Option C after Gate 3**,
when there is a real-Windows installer test routine to validate the
custom script. Choose B only if the owner wants "uninstall removes
everything" as a product promise, together with its two mandatory
companions above.

Whichever option is chosen, record it by setting the key **explicitly**
in package.json (`true` or `false`) so the behaviour is a decision in
the repo, not a tool default nobody picked. Applying the key is a
one-line change for the build stream (R5/coordinator); this paper
changes no configuration.
