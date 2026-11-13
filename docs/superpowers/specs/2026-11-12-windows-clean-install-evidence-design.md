# Windows Clean-Install Evidence Design

**Status:** Approved for implementation planning on 2026-11-12.

**Scope:** Add a manually triggered, evidence-only GitHub Actions workflow
that exercises the exact LHM Windows installer from a successful `main` build
on a fresh hosted Windows runner. The workflow must never publish a release,
approve Gate 4, create an owner receipt, edit Camoufox capabilities, or use
customer data.

## 1. Goal

Close the automated portion of the installed-Windows evidence gap by proving
that an exact candidate installer can be installed silently on a fresh hosted
runner, can start from the installed location, preserves synthetic application
data across an install-over-existing transition, and leaves application data
intact after silent uninstall. Every result is bound to the candidate commit,
CI run, installer filename, byte length, and SHA-256.

This is supporting technical evidence only. It does not replace the independent
Windows owner checks, production publisher ceremony, real proxy/DNS/WebRTC
measurements, resource-tier matrix, or release-owner approval required by the
Camoufox release preflight.

## 2. Considered approaches

### A. Fresh install plus install-over-existing continuity (selected)

Use two successful `Build Windows EXE` runs: a prior `main` run as the baseline
and the current `main` run as the candidate. Install the baseline, start it
against isolated synthetic application data, install the candidate over the
same program directory, start it again, then uninstall and verify retention.

This gives the strongest safe automation currently possible. Because both
artifacts may carry the same application version, the evidence must call the
transition `install-over-existing` or `reinstall continuity`, never claim that
it proves a semantic version upgrade.

### B. Candidate clean install and uninstall only

This is simpler but does not exercise continuity across two builds. It remains
useful as a fallback when no eligible baseline artifact exists, but it is not
the default workflow.

### C. Draft-release preparation only

The repository already has a draft-release workflow. Reusing it would validate
artifact provenance but would add no installed-Windows evidence, so it is out
of scope.

## 3. Trigger and trust boundaries

Create a `workflow_dispatch` workflow with two required decimal inputs:

- `candidate_run_id`: successful `Build Windows EXE` run for the exact current
  `main` commit;
- `baseline_run_id`: successful earlier `Build Windows EXE` run whose commit is
  an ancestor of the candidate.

The workflow receives only `actions: read` and `contents: read`. It must run on
`windows-latest`, use a concurrency group that prevents overlapping acceptance
runs, and have a bounded timeout.

Before downloading artifacts, it must use the GitHub API to verify:

1. the checked-out commit is the current remote `main` head;
2. the candidate run completed successfully, used
   `.github/workflows/windows-exe.yml`, ran on `main`, and has the same commit;
3. the baseline run completed successfully using that same workflow;
4. the baseline commit differs from and is an ancestor of the candidate;
5. neither run came from an untrusted fork context.

Any mismatch stops the workflow before installer execution.

## 4. Artifact verification

Download `LHM-Ads-Browser-Windows-x64` and
`LHM-Release-Evidence-Windows` from both run IDs into separate directories.
Each directory must contain exactly one installer and one evidence JSON file.

For both builds, validate:

- evidence schema is `lhm.release.build-evidence.v1`;
- commit and run ID match the verified GitHub API values;
- installer name, size, and SHA-256 match the evidence;
- `publicReleaseAuthorized` is `false`;
- outcome is `CI_BUILD_EVIDENCE_ONLY_NOT_COMMERCIAL_APPROVAL`;
- the actual downloaded installer bytes match the recorded SHA-256.

The candidate filename must also match the version and NSIS artifact naming in
the checked-out `package.json`. Verification must use streaming hashes and must
not trust a filename or metadata claim by itself.

## 5. Isolated Windows execution

All mutable paths live below `$RUNNER_TEMP`. The workflow must not read browser
profiles, credentials, proxy settings, or user data from the runner account.

### Baseline phase

1. Silently install the baseline NSIS installer into a fixed temporary program
   directory.
2. Start the installed executable with a process-local `APPDATA` and
   `LOCALAPPDATA` rooted below the acceptance directory.
3. Wait for the application storage file to be created, require the installed
   process to remain alive for a bounded observation window, then terminate the
   process tree cleanly.
4. Add a clearly named synthetic continuity marker beside the generated
   application storage and record its digest.

### Candidate phase

1. Silently run the candidate installer against the same program directory.
2. Require the installed executable to exist and its product version to match
   `package.json`.
3. Start the candidate with the same isolated `APPDATA` and `LOCALAPPDATA`.
4. Require the storage file and synthetic marker to remain present and
   unchanged, then terminate the process tree.
5. Run the existing packaged UI capture mode from the installed executable into
   an explicit temporary capture directory. Require normal exit and the same
   release screenshot set/size checks used by the build workflow.

### Uninstall phase

1. Locate the NSIS uninstaller only inside the fixed temporary program
   directory and run it silently.
2. Require installed executable removal and no surviving LHM application
   process.
3. Require the isolated application-data directory, generated storage, and
   synthetic marker to remain present and unchanged, matching
   `deleteAppDataOnUninstall: false`.

The workflow must not disable Defender or SmartScreen and must record the
installer Authenticode status as informational because project policy does not
require Authenticode.

## 6. Evidence model

Add a small Node.js evidence builder that accepts a measurement JSON document
produced by the PowerShell runner plus the two verified release-evidence
documents. It validates a closed schema and emits
`lhm.windows-clean-install-evidence.v1` containing:

- generated UTC time and hosted-runner environment class;
- baseline/candidate commit, build run ID, filename, bytes, and SHA-256;
- install, baseline launch, install-over-existing, candidate launch, packaged
  UI capture, uninstall, process-cleanup, and retention results;
- synthetic marker digest and privacy statement;
- explicit limitations:
  `sameVersionMayBeReinstall`, `notOwnerReceipt`, `notCleanMachineManualGate`,
  `notCamoufoxEngineAcceptance`, and `notCommercialApproval`;
- outcome `AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY` only when all automated
  checks pass.

The builder rejects unknown fields, absolute local paths, usernames, machine
names, IP addresses, tokens, proxy strings, or private-key material. The
published artifact contains the final JSON and non-sensitive logs only; it
must not contain the installers, user-data directory, screenshots with secrets,
or the synthetic storage database.

## 7. Failure handling

Every installer, application, and uninstaller process has a timeout. Cleanup
runs under `if: always()` and terminates only process IDs launched by the
workflow or executables resolved below its temporary program directory. It
must not kill processes by broad image-name matching.

If any phase fails, the workflow still attempts cleanup and uploads a bounded
diagnostic log, but it must not emit a passing evidence document. Secrets and
full local paths are redacted before artifact upload.

## 8. Tests

Tests follow the repository's plain Node.js test style:

- unit tests for the evidence builder's valid report, closed schema, binding,
  privacy scan, path rejection, incorrect digest, false pass, and limitation
  fields;
- static workflow contract tests for manual trigger, read-only permissions,
  exact run provenance, ancestor check, artifact names, isolated paths,
  timeouts, PID-scoped cleanup, evidence-only outcome, and absence of release
  publishing or capability edits;
- PowerShell syntax/static checks for fixed-root path resolution and bounded
  process handling;
- focused tests first, then the complete `npm test` suite. GitHub only accepts
  manual dispatches for a workflow present on the default branch, so the first
  real hosted-runner dispatch occurs immediately after the reviewed change is
  merged. A failure keeps the evidence gate incomplete and must be fixed by a
  follow-up pull request; it never falls back to a fabricated pass.

## 9. Acceptance criteria

The change is ready to merge for its first operational run when:

1. all new tests pass and the full suite remains green;
2. static workflow tests prove the manual-only trigger, provenance checks,
   read-only permissions, isolated execution, cleanup, and non-release scope;
3. the report labels the two-build transition honestly as
   install-over-existing/reinstall continuity when versions are equal;
4. no release is created, no Camoufox capability changes, and no owner receipt
   is synthesized;
5. the Camoufox release preflight remains blocked on every genuinely manual or
   external gate until authentic evidence is supplied.

After merge, operational acceptance additionally requires a successful manual
dispatch whose uploaded JSON binds the then-current `main` commit and exact
installer bytes. Until that run succeeds, the hosted-runner evidence gate
remains incomplete.
