# Camoufox local release preflight — design

Date: 2026-11-11
Status: approved by owner on 2026-11-11

## 1. Goal and boundary

Add one local, read-only preflight command that answers whether a specific
Camoufox release candidate has enough bound evidence to be sent to the owner
for final release review.

The command does **not**:

- edit `capabilities.json`;
- install or launch a browser;
- create/sign keys, manifests or artifacts;
- download or publish a GitHub release;
- accept proxy credentials on the command line;
- claim platform non-detection, advertising-account safety, or “100%” privacy.

The strongest successful state is `READY_FOR_OWNER_REVIEW`, not automatic GA.
Publishing and capability activation remain separate owner-controlled actions.

## 2. Chosen approach

Use one Node CLI backed by a pure evaluator module:

- `src/engine/camoufoxReleasePreflight.js` parses already-produced evidence and
  returns a deterministic report;
- `tools/camoufox-release-preflight.js` resolves explicit paths, loads files,
  invokes the evaluator and prints JSON;
- `test/camoufox-release-preflight.js` covers ready, blocked, malformed, stale
  and mismatched evidence.

This is preferred to a CI-only gate because production proxy, DNS, GPU,
installed-Windows and resource measurements run on controlled Windows hosts,
not ordinary GitHub-hosted runners. CI may call the same CLI later, but this
design does not add a workflow or a publishing action.

## 3. Inputs

All inputs are explicit absolute paths. No file is discovered from a customer
profile directory.

- packaged Camoufox resource directory containing the public key, release
  descriptor and capability policy;
- installed engine directory containing the signed manifest and complete tree;
- Windows installer artifact;
- an evidence directory containing the bound JSON measurement reports;
- an owner ceremony receipt for the production publisher key;
- an owner clean-install receipt for the exact installer hash.

Receipts are evidence references, not secret-bearing attestations. They contain
only schema/version, timestamp, exact hashes, environment class, checklist
booleans and owner approval identifier. They must not contain a private key,
passphrase, proxy endpoint, proxy username/password, IP address, profile name,
cookie, account identifier or advertising data.

## 4. Binding rules

Every automated report must bind to the candidate by the fields it can
authoritatively observe:

- exact Git commit where applicable;
- exact `camoufox.exe` SHA-256;
- exact engine version;
- exact installer SHA-256 for packaged/clean-install evidence;
- measurement timestamp and supported schema;
- Windows tier/environment label.

Evidence is rejected when malformed, older than 30 days, bound to another
engine/installer/commit, or recorded as `NOT_RUN`. A report from the extracted
staging tree may not substitute for installed-engine evidence when the gate
requires the installed path.

The owner publisher ceremony receipt must bind to the SPKI SHA-256 of the public
key packaged in the candidate and explicitly record that the private key is
encrypted, outside Git, independent of the license key, and backed up in two
owner-controlled offline locations. The preflight cannot independently prove
physical custody; it reports the receipt as a manual owner assertion.

## 5. Gate model

Each gate returns `PASS`, `BLOCKED`, or `MANUAL_REQUIRED`, plus a short reason
and the evidence file used. Missing or unparseable data never becomes PASS.

Required gates:

1. **Artifact trust** — publisher key and release descriptor validate; archive
   size/hash and signed manifest agree; installed tree verifies all files and
   entry hash; no private key or loose engine payload is packaged in the app.
2. **Publisher ceremony** — production-key receipt matches packaged SPKI.
3. **Configured identity** — two distinct synthetic identities match their own
   expectations across launch/restart; extended points state measured,
   unsupported or blocked individually.
4. **Storage isolation** — baseline, concurrent cross-write, snapshot restore,
   config backup/restore, HTTP cache and favicon cache PASS.
5. **Crash durability** — 10-second idle-flush crash recovery PASS. The known
   1.5-second Camoufox localStorage durability finding is accepted only when
   the report shows exactly that field reverted to A's prior committed value,
   all other A fields persisted, every B field stayed unchanged, and no marker
   crossed profiles. Any broader failure blocks.
6. **WebGL/Canvas/Audio/fonts** — headful real-GPU WebGL matches both pinned
   vendor/renderer expectations (2/2 each); Canvas and OfflineAudio are
   measured; font probing is measured and labelled as probing, never a full
   inventory claim.
7. **Real proxy network** — public-STUN transport control ran; real-proxy P2
   ran with no unexpected public candidate; DNS followed the real proxy route;
   manager and browser-runtime egress observations both exist and agree. Lab
   proxy P1 is supporting evidence only.
8. **Resource capacity** — required benchmark reports exist for the approved
   RAM tiers and concurrency levels, preserve at least 20% RAM headroom, have
   zero crashes and complete process cleanup. Unmeasured tiers remain blocked;
   the evaluator does not interpolate.
9. **Packaged UI** — exact packaged artifact smoke exits zero, stderr is empty
   and every required capture is present and non-trivial.
10. **Clean install/upgrade** — owner receipt records fresh install and upgrade
    on a clean Windows VM for the exact installer SHA-256, including uninstall
    data-retention behavior.

Overall state:

- `BLOCKED` if any required gate is blocked or any receipt is missing;
- `READY_FOR_OWNER_REVIEW` only when every required gate passes and every
  manual receipt is present and matches;
- never an automatic `RELEASED` state.

## 6. Output and exit codes

The CLI prints one JSON document with:

- schema, generated time and candidate hashes;
- overall state;
- ordered gate results;
- blockers and manual assertions;
- evidence paths reduced to safe basenames in the report;
- a fixed limitation stating that the result does not prove a website cannot
  associate profiles.

Exit codes:

- `0`: `READY_FOR_OWNER_REVIEW`;
- `2`: valid evaluation with one or more blockers/manual requirements;
- `1`: invalid arguments, unsafe path, malformed evidence or internal error.

No raw proxy, IP, account, cookie, identity blob or private-key material is
printed.

## 7. Failure handling and security

- Refuse relative paths, symlinks for trust/evidence inputs, oversized JSON and
  files outside the explicitly supplied roots.
- Stream-hash the installer and large artifacts; never load a multi-GB archive
  into memory.
- Parse only allowlisted fields needed by a gate. Preserve unknown fields as
  ignored, not trusted.
- Report a missing prerequisite once with the exact next measurement required.
- Never mutate or delete evidence on failure.

## 8. Testing strategy

TDD sequence:

1. failing pure-evaluator tests for a fully ready fixture and each single-gate
   blocker;
2. binding tests for wrong engine, installer, commit, expired timestamp and
   staging-key receipt mismatch;
3. exact known-crash-finding acceptance plus broader-failure rejection;
4. privacy tests proving secrets/IPs/identity chunks cannot appear in output;
5. CLI tests for exit 0/2/1, absolute paths, symlinks, size limits and no writes;
6. focused Camoufox tests, then the complete `npm test` suite and Windows build.

Live reports remain outside Git. The committed acceptance document may contain
only hashes, aggregate results and truthful `PASS/BLOCKED/NOT_RUN` summaries.

## 9. Acceptance criteria

- Current RC evidence returns `BLOCKED`, specifically naming real-proxy/DNS/
  runtime egress, resource tiers, production publisher ceremony and clean
  install as incomplete.
- Synthetic complete fixtures return `READY_FOR_OWNER_REVIEW`.
- Removing or changing any required binding makes the corresponding gate block.
- The command makes zero filesystem writes and zero network requests.
- Capability policy and GitHub release state are byte-for-byte unchanged after
  every preflight run.
