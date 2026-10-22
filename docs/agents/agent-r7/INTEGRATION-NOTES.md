# Agent R7 (Wave R — release prep): docs completion + release notes

Branch `agent-r7/docs-completion`, base `f280296` (verified at
checkout). Docs only — no source, test, or workflow files touched.
No push/merge/tag performed.

## Deliverables

1. **`docs/customer-guide/01-cai-dat-va-kich-hoat.md`** (edited in
   place) — fulfils the outstanding commitment recorded 2026-10-22:
   the one-line SmartScreen note at the end of §1.1 is replaced by a
   full subsection, "Khi Windows hiện cảnh báo SmartScreen lúc chạy
   tệp cài đặt". It states the current release ships unsigned by the
   seller's choice (neutral wording, no apology copy), describes
   what the prompt looks like (blue SmartScreen window, **Don't
   run** + **More info**, possible "Unknown publisher" UAC), why it
   appears (no Authenticode signature + no per-file reputation
   history; may recur on the next version), and the exact
   click-through: verify the file came from the seller via the
   agreed channel → compare the published SHA-256 → **More info** →
   check the file name → **Run anyway** → **Yes** on UAC. It also
   tells the reader NOT to disable SmartScreen/Defender machine-wide,
   and distinguishes the Authenticode certificate from the product's
   internal license/engine signatures (§1.1 step 3).

2. **`docs/agents/agent-r7/PR-18-DESCRIPTION-DRAFT.md`** — paste-ready
   replacement body for PR #18 (the live body still describes the old
   phase-C `07150d6` snapshot). Written in English to match the
   existing PR. Covers: the snapshot chain (`e1de963` → `1c3e065` →
   `38b25d7` → `f549a63`, mapped to local trees `07150d6` / `f4d7329` /
   `e3fd868` / `f280296`, verified against
   `ggminh-integration.muse-github-snapshot-sync.json`); phase-C,
   Wave 1, Wave 2 and Wave 3 (Agent 20 QA) contents; test evidence
   (201-step chain; Linux 199/201 with both failures mechanism-verified
   as Windows-platform fixtures); CI run **39641363889 SUCCESS** at
   `f549a63`; artifact table (ZIP `sha256:8e5ca8a6…`, UI preview
   `sha256:c340861e…`, inner EXE 89,473,785 bytes, SHA-256
   `54aec523…`); the `.github/workflows` divergence and the unapplied
   configured-measurement step; the §12 gate table (Gate 2 build PASS,
   configured measurement NOT MET, Gate 3 no evidence, Gate 4 not
   done; verdict NOT_READY, zero code blockers); pending owner
   decisions (QD-01…QD-04, A12 D1–D4, A17 F3/F4, echo endpoint) and
   recorded ones (no Authenticode; pilot caution ruling); and the
   divergent-stream reconciliation debt (`7f13c3f`, `8c1ab69`,
   unpushed `89b3c2c` + uncommitted work).
   **Coordinator/owner action:** paste the file content as the PR
   body; consider also updating the PR title, which still says
   "10-agent deployment" only (suggestion: "v5.8.0 Preview —
   phase-C + commercial Waves 1–2 (integration/v5.8-phase-c)").

3. **`docs/agents/agent-r7/RELEASE-NOTES-v5.8.0-preview.md`** —
   customer-facing release notes (Vietnamese) for 5.8.0 Preview:
   Preview status with the Gate-3 honesty box and the owner's
   supervised-internal-use ruling; installer identity table (file
   name, 89,473,785 bytes, SHA-256 `54aec523…`, unsigned note
   pointing at the new guide §1.1 subsection); "what's new vs 5.7.0"
   limited to changes absent from `main` `77075f3` and verified in
   this tree; a known-limits section (full CHƯA ĐO list delegated
   to guide chapter 7, plus per-profile measurement records not
   existing yet, update checker prototype not wired — verified by
   grep: no reference from `main.js`/`preload.js`/UI — session
   snapshots not purged (F3), no app icon, no bundled commercial
   Camoufox engine); and an editorial appendix mapping every claim
   to its source file/commit, marked "delete before publishing".
   **Coordinator/owner action:** publish from this file after
   deleting the appendix; if a customer-docs index entry is wanted,
   add it to `docs/customer-guide/README.md` at integration time
   (not done here to avoid index/link churn in a docs-only branch).

## §11 self-scan (all three deliverables, run before commit)

Patterns scanned with grep over the three files: percentages
(`%`), competitor names (AdsPower, Multilogin, GoLogin, Dolphin,
Incogniton, Octo, Kameleo, "đối thủ"/"competitor"), banned safety
copy ("AN TOÀN để chạy Ads", "safe to run", "pass Google/Facebook",
"vượt qua mọi kiểm tra"), Vietnamese absolutes ("không bao giờ",
"bảo đảm", "đảm bảo", "tuyệt đối", "chắc chắn", "luôn là người
mới", "qua mặt"), English absolutes ("never", "always",
"guarantee").

Result: **no hits** for percentages, competitor names, banned
safety copy, or Vietnamese absolutes. Two English "never" hits in
the PR draft, both classified as verified code-behaviour
statements, not marketing absolutes (same classification precedent
as Agent 20's Wave-2 delta scan):

- "an invalid generated identity is never attached" —
  `src/engine/camoufoxProvisioning.js` rejects an invalid generated
  blob before attachment; pinned by provisioning tests.
- "it never downloads or applies an update" —
  `src/update/updateCheck.js` contains no download/write/apply
  code path; its remote function fetches only the manifest.

Preview status is stated honestly in both customer-facing
deliverables; no claim in the release notes lacks a source in the
appendix table.

## Notes for the coordinator

- Nothing in this branch changes behaviour; a docs-only merge
  carries no test-chain impact. The guide's existing links
  (to chapters 02 and 06) were not touched.
- The release notes deliberately do NOT claim a warning-history
  clear button in the UI: `clearWarningHistory` exists in
  `main.js`/`preload.js` but a grep of the renderer/UI found no
  control invoking it — only persistence is claimed.
- If QD-03 is approved later, guide chapter 7 §7.3 statuses move
  with the constitution; the release notes defer to chapter 7
  rather than restating statuses, so they should not drift.
