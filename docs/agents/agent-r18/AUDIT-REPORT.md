# AUDIT REPORT — Agent R18: installer & first-run polish (Wave R, release-prep)

- Branch: `agent-r18/installer-polish`, base **f280296** (verified HEAD before branching).
- Environment: Linux x86_64, Node 24 — static code audit + VM/stub UI tests.
  **Tier (§23): nothing in this report is evidence about the packaged app
  on Windows.** Installer behaviours attributed to electron-builder are
  its documented defaults for the committed configuration; every one of
  them is a Gate 3 confirmation item, not a measurement.
- State legend: **OK** (verified in tree) · **fixed-in-branch** ·
  **proposal** (written up, not applied) · **owner-decision** ·
  **NOT_RUN** (needs real Windows).

## A. Agent 16's eight first-run fixes — re-verified at f280296

| # | A16 fix | Evidence at f280296 | State |
|---|---------|--------------------|-------|
| 1 | Provisioning verdict surfaced after profile creation (was silently discarded) | `renderer.js` `provisioningSaveNotice()` + call on the saved profile in the save flow; `test/first-run-ux.js` PASS | OK |
| 2 | "Cấp danh tính" row action exists and calls the IPC | `renderer.js`: `btn-provision` button for unprovisioned Camoufox rows; handler calls `window.api.provisionCamoufoxIdentity(profile.id)` | OK |
| 3 | Truthful row/panel identity labels | `renderer.js` `identityMetaText` ("Danh tính đã ghim" / "Chưa cấp danh tính đã ghim"); `profilePanel.js:32` same wording | OK |
| 4 | Empty state split: fresh install vs filter-no-match | `renderer.js` renderProfiles empty branch rewrites the h3/p per state ("Chưa có hồ sơ" vs "Không có hồ sơ nào khớp") | OK |
| 5 | Engine-dialog raw reasons translated to Vietnamese guidance | `engineSource.js:16` `camoufoxRuntimeGuidance()` (Windows-only / publisher-signed / fallback, each with a next step) | OK |
| 6 | Engine-dialog failures carry a recovery step | Guidance strings end with a concrete action (use Chromium/Firefox meanwhile, contact seller, retry Refresh); install-info flows asserted in `test/first-run-ux.js` | OK |
| 7 | Create form shows live Camoufox engine status | `updateCamoufoxFormHint()` via `window.api.camoufoxInstallStatus()`, 3 machine states + failure fallback | OK (mechanism changed in-branch — §C) |
| 8 | Profile panel no longer mislabels Camoufox as "Firefox / Gecko" | `profilePanel.js:30`: `'Camoufox / Gecko'` for camoufox profiles | OK |
| 9 | (A16 proposal, applied by coordinator in f280296) main.js persists the provisioning reason | `main.js:656` `profile.fingerprint.identityProvisioningReason = provisioning.reason` before save | OK |

All eight fixes are genuinely present — none regressed in the Wave-2
integration. A16's proposal #10 was the only deferred item; §C closes it.

## B. The customer path, step by step

| Step | What the customer meets | State |
|------|------------------------|-------|
| Download | One file, `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` (`nsis.artifactName`); the customer guide (file 01) names exactly this file | OK |
| SmartScreen | EXE is unsigned (owner decision: no Authenticode) → "Windows protected your PC" prompt, More info → Run anyway. Guide wording for this is R7's file, untouched here | owner-decision (accepted) / Gate 3 to observe |
| Installer wizard | `oneClick:false` (assisted), `allowToChangeInstallationDirectory:true`, `createDesktopShortcut:true`. `perMachine` unset → electron-builder default **per-user** install (`%LOCALAPPDATA%\Programs\LHM Ads Browser`); `allowElevation` unset → default true, so the wizard offers "install for all users" which triggers UAC | OK-by-config / NOT_RUN on Windows |
| Standard user, no admin | Per-user path needs **no admin rights and shows no UAC** — the app installs and runs under a locked-down account. Only the all-users choice elevates. This is the friendliest possible default for agency staff machines | OK-by-config / NOT_RUN |
| Payload honesty | The Preview installer ships **no commercial Camoufox assets** (`resources/bundled-engines/` and `resources/camoufox-engine/` contain only README.md; CI staging-verify fails the build if that changes silently) → first-run Camoufox state is truthfully "not installed", and the UI says so with next steps (§A.5–7) | OK |
| First launch | Version surfaces all derive from `app.getVersion()` via `src/ui/appIdentity.js` — header, nav, About dialog, and the window title (`LHM Ads Browser v5.8.0 — Workspace`); About also states packaged-vs-source build. `main.js` CI screenshot gate fails if the UI version ≠ the release version | OK |
| License / trial | The license dialog states the trial terms in Vietnamese (30 days, max 10 profiles, what still works after expiry, no online payment/remote revocation) — `index.html` license modal | OK |
| Create first profile | Empty state (§C.2b), engine note + live hint (§C.2a/2c), provisioning verdict after save (§A.1) | fixed-in-branch / OK |
| Everyday errors | UI-wide pattern: Vietnamese prefix + raw `error.message` detail. Acceptable where module messages are Vietnamese or machine codes; the one customer-facing exception is licensing (§D.1) | proposal |

## C. A16 proposal #10 — APPLIED in this branch

Exact texts taken from `docs/agents/agent-16/INTEGRATION-NOTES.md` §2.

- **2a (fixed-in-branch)** — `#camoufox-form-hint` is now static markup in
  `index.html` inside the engine form-group, right after the static note,
  with the same `role="status"` and styling the runtime element had.
  `updateCamoufoxFormHint()` in `renderer.js` was reduced to an id lookup
  (dynamic `createElement`/`appendChild` removed); all three availability
  messages and the failure fallback are byte-identical.
- **2b (fixed-in-branch, one refinement)** — `#empty-state` gains the real
  button `<button id="empty-state-create" class="btn btn-primary">Tạo hồ
  sơ đầu tiên</button>`, wired to the same click path as the toolbar
  create button. Refinement: because the renderer reuses `#empty-state`
  for the filter-no-match state, the button is hidden there
  (`emptyCreateBtn.hidden = allProfiles.length !== 0`) — in that state
  the copy already tells the user to clear the filters, and a "create
  your first profile" button would be wrong. The A16 wording and target
  behaviour for the fresh-install state are unchanged.
- **2c (fixed-in-branch)** — the pinned-identity sentence is appended to
  the static note under `#field-browser-engine`, verbatim from the
  proposal.

Tests: new `test/installer-first-run-polish.js` — static assertions for
all three items + a VM run of the extracted `updateCamoufoxFormHint()`
across 6 scenarios (non-Camoufox hides with no API call; installed;
available-not-installed; unavailable; IPC failure degrades to the
neutral message; missing element is a silent no-op). **PASS.**
Regression set, all **PASS**: `first-run-ux`, `app-identity`,
`workspace-ui`, `dashboard-ui`, `profile-panel`, `license-center-ui`,
`release-readiness`, plus `node --check src/ui/renderer.js`.
Chain wiring (append after `first-run-ux`) is in INTEGRATION-NOTES.md —
package.json is a shared file and was not edited.

## D. Leftover English / raw strings in first-run flows

1. **License activation shows raw English manager errors — proposal.**
   `src/licensing/manager.js` throws English strings (`License signature
   mismatch`, `License expired`, `Invalid license fields`, …) and
   `src/ui/licenseCenter.js` surfaces them verbatim (lines 51/69 assign
   `error.message` directly; line 61 prefixes `Kích hoạt thất bại: `).
   A first-run customer pasting a wrong token sees e.g. *"Kích hoạt thất
   bại: License signature mismatch"*. Agent 18 documented this and
   deliberately left manager strings untouched (tests pin them).
   Proposal (INTEGRATION-NOTES): translate at the licenseCenter
   presentation layer via a message map — manager strings unchanged —
   with owner-approved Vietnamese wording per failure class. Not applied
   here: activation is a money-path surface and A18's wording proposals
   are already awaiting the owner.
2. **English chrome labels — owner-decision if ever.** Nav/section
   labels ("Workspace", "Control Tower", "AI CONTROL CENTER", "Profile
   Health Center", "Browser Engine Diagnostics") are the product's
   long-standing bilingual styling, present on every screen, not
   first-run errors. Recorded for completeness; no change proposed.
3. **One unprefixed raw error — proposal (minor).**
   `src/ui/maintenance.js:251` shows the backup result as the bare
   `error.message` with no Vietnamese prefix, unlike every sibling flow.
   One-line fix proposed in INTEGRATION-NOTES; maintenance.js is outside
   this audit's applied-change scope.

## E. Version & branding consistency

| Surface | Value today | State |
|---------|-------------|-------|
| package.json `version` → `app.getVersion()` | `5.8.0` — single source for header/nav/About/title | OK |
| Installer filename | `LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe` — carries "Preview" | OK |
| Customer guide / seller runbook | "5.8.0 (Preview)", Preview status stated | OK |
| **In-app surfaces** | **No "Preview" anywhere** — title and About show plain `v5.8.0` | **owner-decision** |
| package.json `author` | `"Antigravity Senior Engineer"` — template leftover | proposal (R5) |
| App / installer icon | none — Electron default icon in installer, shortcuts, taskbar | owner-decision (R5 asset) |
| package.json `name` | `power-browser` — internal only; packaged app uses productName `LHM Ads Browser`, appId `vn.lhm.adsbrowser` | OK (noted) |
| README.md "v5.7" heading | historical changelog section, not a current-version claim | OK |

On the in-app "Preview" gap, three options for the owner (none applied —
package.json belongs to the build/R5 stream and this is a release
identity choice): **(1)** keep as-is — "Preview" is a channel label on
the installer/docs; cost: support screenshots never show Preview status.
**(2)** rename the version to a semver prerelease (`5.8.0-preview`) —
flows into every in-app surface automatically, but the artifact name
and the guide's filename must be adjusted with it. **(3)** add a static
"Preview" badge beside the version in header + About only — in-app
honesty without renaming the release. Recommendation: (3) if the owner
wants the app itself to disclose Preview status; (1) is defensible if
support always asks for the installer filename.

The `author` leftover should be replaced with the owner's selling name
before any signed/public build — it is the metadata Windows shows as
the program's publisher/company in several surfaces. The string itself
is the owner's to supply (R5 applies it).

## F. Uninstall behaviour — decision required

Current committed state: `nsis.deleteAppDataOnUninstall` is **unset** →
electron-builder default **false** → uninstall removes the program files
only; the entire user-data tree (`%APPDATA%\LHM Ads Browser\` — profile
store, all browser-profile data roots, extensions, license state,
warning history, exit-IP observations) **stays on disk indefinitely**.
This matches what the customer guide already tells users, so today's
behaviour is at least honestly documented — but it has never been an
explicit owner decision. The full paper — keep / always-delete /
ask-at-uninstall (a custom NSIS include with a silent-mode-safe prompt;
electron-builder has no built-in prompt option), consequences of each,
and a recommendation (keep for the first commercial release, revisit
the prompt option after Gate 3) — is in **UNINSTALL-DECISION.md**.

Related observation (noted, low severity): because install and data
are per-Windows-user, the 30-day trial store is also per-Windows-user
on a shared machine, while activated licenses are machine-bound.
Whether the trial should be machine-scoped is a licensing-policy
question for the owner; it does not affect the manual pilot flow.

## G. NOT_RUN register (all Gate 3, real Windows)

- SmartScreen prompt appearance + Run-anyway path for this exact artifact.
- Wizard scope page (per-user default, all-users elevation), directory
  change, shortcut creation, standard-account install without admin.
- Defender behaviour on install/first run (incl. the asar-unpacked .ps1
  helpers — a plausible AV-heuristic trigger, unobserved either way).
- Uninstall residue under each option in UNINSTALL-DECISION.md.
- First-run on a machine with a legacy data directory (main.js migrates
  a legacy storage dir into userData on first launch — code-verified,
  never exercised on a real upgrade install).
