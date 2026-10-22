#!/usr/bin/env bash
# Configured-measurement end-to-end rehearsal (Agent R2, Wave R).
#
# Rehearses, on Linux with the real Camoufox engine, the exact pipeline
# the Windows CI smoke workflow is supposed to run for the configured
# Stage-0 measurement (release/workflows/camoufox-upstream-smoke.yml,
# steps "Generate two pinned identities with the official launcher" and
# "Measure two configured Camoufox profiles through the selective
# controller"):
#
#   Phase 1  REPRODUCE Agent 2's diagnosis: the generate step's guard
#            throws 'Pinned camoufox launcher runtime missing' because
#            no step creates $RUNNER_TEMP/lhm-camoufox-runtime — while
#            camoufox@0.5.8 IS present at the repo root (installed by
#            the earlier workflow step into the wrong place).
#   Phase 2  APPLY the APPLY-GUIDE §4 fix: install the pinned packages
#            into a fresh prefix dir; the guard then passes.
#   Phase 3  STAGE the generator + its repo imports into the prefix and
#            GENERATE two pinned identities with the official generator
#            (en-US/America/New_York and vi-VN/Asia/Ho_Chi_Minh, exactly
#            the CI arguments; --os windows, as in CI — the engine
#            applies the drawn OS identity on any host).
#   Phase 4  Run the CI measurement script stage0-measure/run-config.js
#            UNMODIFIED: it must refuse on Linux (win32 gate) — recorded
#            as NOT_RUN by design, the proof that the script itself can
#            only ever be exercised by the Windows runner.
#   Phase 5  MEASURE with stage0-measure/run-config-rehearsal.js, the
#            minimal Linux port of run-config.js (same controller, same
#            core comparisons, same assertions), under Xvfb.
#   Phase 6  Assemble the evidence pack.
#
# Inputs (env):
#   CAMOUFOX_BIN    engine executable (default ~/tmp-big/cfx-build/camoufox-bin)
#   CAMOUFOX_SHA256 approved engine SHA-256 (default: the pinned Linux build)
#   WORK            scratch dir (default: mktemp -d); identities + logs live here
#   EVIDENCE_DIR    where the evidence pack is written
#                   (default: <repo>/docs/agents/agent-r2/evidence)
#
# Synthetic profiles only. Inherited *_PROXY variables are scrubbed ONLY
# for the browser-measurement child processes (Phases 4–5; Agent 5's
# recorded lesson: they pollute lab/browser runs). They are deliberately
# KEPT for npm: in sandboxes whose registry egress goes through the env
# proxy, scrubbing them makes every registry fetch fail with
# ERR_SSL_WRONG_VERSION_NUMBER (observed in rehearsal attempt 2 — see
# INTEGRATION-NOTES §6). Only the variable NAMES are recorded.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAMOUFOX_BIN="${CAMOUFOX_BIN:-$HOME/tmp-big/cfx-build/camoufox-bin}"
CAMOUFOX_SHA256="${CAMOUFOX_SHA256:-2a2cb03f6ca4cfa96cdb9d0991b52f4dc02d7f097d3253d355f6a6361ce28669}"
WORK="${WORK:-$(mktemp -d /tmp/lhm-config-rehearsal-XXXXXX)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$REPO_ROOT/docs/agents/agent-r2/evidence}"
LOGS="$WORK/logs"; mkdir -p "$LOGS" "$WORK/runner-temp"
RUNNER_TEMP="$WORK/runner-temp"
RUNTIME="$RUNNER_TEMP/lhm-camoufox-runtime"
VERDICTS="$WORK/verdicts.txt"; : > "$VERDICTS"
say(){ echo "$@" | tee -a "$VERDICTS"; }

# Record inherited proxy env NAMES (values never printed). Scrubbing is
# applied per-process in Phases 4–5 via `env -u`, NOT globally (see header).
PROXY_VARS_PRESENT=""
for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY no_proxy NO_PROXY; do
  if [ -n "${!v:-}" ]; then PROXY_VARS_PRESENT="$PROXY_VARS_PRESENT $v"; fi
done
UNSET_PROXY=(-u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY
  -u all_proxy -u ALL_PROXY -u no_proxy -u NO_PROXY)

# ---------- Phase 0: environment ----------
{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host: $(uname -srm)"
  echo "node: $(node --version)  npm: $(npm --version)"
  echo "repo: $REPO_ROOT"
  echo "branchHead: $(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "engine: $CAMOUFOX_BIN"
  echo "engineSha256: $(sha256sum "$CAMOUFOX_BIN" | awk '{print $1}')"
  echo "engineSha256Approved: $CAMOUFOX_SHA256"
  echo "xvfb-run: $(command -v xvfb-run || echo MISSING)"
  echo "proxyVarsPresent:${PROXY_VARS_PRESENT:- none} (scrubbed for measurement processes only; kept for npm egress)"
  echo "workdir: $WORK"
} > "$LOGS/environment.txt"
cat "$LOGS/environment.txt"
if [ "$(sha256sum "$CAMOUFOX_BIN" | awk '{print $1}')" != "$CAMOUFOX_SHA256" ]; then
  say "PHASE0 FAIL: engine SHA-256 does not match the approved reference"; exit 2
fi
if [ ! -d "$REPO_ROOT/node_modules/camoufox" ]; then
  say "PHASE0 FAIL: repo-root camoufox missing — run the CI-equivalent installs first (npm ci; npm install --no-save camoufox@0.5.8 playwright-core@1.62.0)"; exit 2
fi
say "PHASE0 PASS: engine digest verified; repo-root camoufox present (CI install step equivalent done)"

# ---------- Phase 1: reproduce the generate-step failure ----------
# Faithful transcription of the CI step's guard (pwsh -> bash):
#   $runtime=Join-Path $env:RUNNER_TEMP 'lhm-camoufox-runtime'
#   if(!(Test-Path (Join-Path $runtime 'node_modules/camoufox'))){
#     throw 'Pinned camoufox launcher runtime missing' }
{
  echo "runtime prefix: $RUNTIME (exists: $([ -d "$RUNTIME" ] && echo yes || echo no))"
  echo "repo-root node_modules/camoufox: $([ -d "$REPO_ROOT/node_modules/camoufox" ] && echo PRESENT || echo absent)"
} > "$LOGS/phase1-repro.log"
if [ ! -d "$RUNTIME/node_modules/camoufox" ]; then
  echo "THROW: Pinned camoufox launcher runtime missing" >> "$LOGS/phase1-repro.log"
  say "PHASE1 REPRODUCED: generate-step guard throws 'Pinned camoufox launcher runtime missing' — prefix was never created, although camoufox@0.5.8 exists at the repo root"
else
  say "PHASE1 FAIL: prefix unexpectedly present in a fresh RUNNER_TEMP — diagnosis not reproduced"; exit 2
fi

# ---------- Phase 2: apply the APPLY-GUIDE fix ----------
npm install --prefix "$RUNTIME" --no-save --no-package-lock --ignore-scripts \
  --no-audit --no-fund camoufox@0.5.8 playwright-core@1.62.0 \
  > "$LOGS/phase2-fix-install.log" 2>&1
FIX_VERSION="$(node -p "require('$RUNTIME/node_modules/camoufox/package.json').version" 2>/dev/null || echo MISSING)"
if [ -d "$RUNTIME/node_modules/camoufox" ] && [ "$FIX_VERSION" = "0.5.8" ]; then
  say "PHASE2 PASS: fix installed camoufox@0.5.8 into the fresh prefix; the generate-step guard now passes"
else
  say "PHASE2 FAIL: prefix install did not yield camoufox@0.5.8 (got: $FIX_VERSION) — see phase2 log"; exit 2
fi

# ---------- Phase 3: stage files + generate two pinned identities ----------
mkdir -p "$RUNTIME/tools" "$RUNTIME/src/engine" "$RUNTIME/src/health"
cp "$REPO_ROOT/tools/generate-camoufox-identity.mjs" "$RUNTIME/tools/"
cp "$REPO_ROOT/src/engine/camoufoxIdentity.js" "$RUNTIME/src/engine/"
cp "$REPO_ROOT/src/health/signalChain.js" "$REPO_ROOT/src/health/proxyValidation.js" "$RUNTIME/src/health/"
GEN="$RUNTIME/tools/generate-camoufox-identity.mjs"
node "$GEN" --executable-path "$CAMOUFOX_BIN" --os windows \
  --locale en-US --timezone America/New_York \
  --out "$RUNNER_TEMP/identity-a.json" > "$LOGS/phase3-generate-a.log" 2>&1
GEN_A=$?
node "$GEN" --executable-path "$CAMOUFOX_BIN" --os windows \
  --locale vi-VN --timezone Asia/Ho_Chi_Minh \
  --out "$RUNNER_TEMP/identity-b.json" > "$LOGS/phase3-generate-b.log" 2>&1
GEN_B=$?
if [ $GEN_A -ne 0 ] || [ $GEN_B -ne 0 ]; then
  say "PHASE3 FAIL: official generator exited non-zero (A=$GEN_A B=$GEN_B) — see phase3 logs"; exit 2
fi
# Validate both identities with the repo's own validator (the same check
# run-config.js performs in loadIdentity) and emit expectations-only
# summaries for the evidence pack (CAMOU_CONFIG chunks stay in $WORK).
cat > "$WORK/validate-and-summarize.js" <<'EOF'
const fs=require('fs');
const {validateStoredIdentity}=require(process.env.REPO+'/src/engine/camoufoxIdentity');
const out={};
for(const [k,f] of [['a',process.argv[2]],['b',process.argv[3]]]){
  const identity=JSON.parse(fs.readFileSync(f,'utf8'));
  const {expectations}=validateStoredIdentity(identity);
  out[k]=expectations;
  const summary={format:identity.format,version:identity.version,
    generator:identity.generator,generatedAt:identity.generatedAt,
    constraints:identity.constraints,expectations,
    envChunks:Object.keys(identity.env||{}).length,
    note:'CAMOU_CONFIG env chunks intentionally not copied into the evidence pack'};
  fs.writeFileSync(process.argv[4]+'/identity-'+k+'.summary.json',
    JSON.stringify(summary,null,2)+'\n');
}
if(out.a.timezone===out.b.timezone||out.a.language===out.b.language){
  console.error('identities do not differ in timezone+language');process.exit(3);
}
console.log('validated: A tz='+out.a.timezone+' lang='+out.a.language+
  ' | B tz='+out.b.timezone+' lang='+out.b.language);
EOF
REPO="$REPO_ROOT" node "$WORK/validate-and-summarize.js" \
  "$RUNNER_TEMP/identity-a.json" "$RUNNER_TEMP/identity-b.json" "$WORK" \
  > "$LOGS/phase3-validate.log" 2>&1 || {
    say "PHASE3 FAIL: generated identities failed repo validation — see phase3-validate.log"; exit 2; }
say "PHASE3 PASS: two pinned identities generated by camoufox@0.5.8 through the staged prefix and validated by the repo validator; they differ in timezone and language"

# ---------- Phase 4: run-config.js unmodified (must refuse on Linux) ----------
(
  cd "$REPO_ROOT"
  LHM_CAMOUFOX_EXECUTABLE="$CAMOUFOX_BIN" \
  LHM_CAMOUFOX_EXE_SHA256="$CAMOUFOX_SHA256" \
  LHM_STAGE0_IDENTITY_A="$RUNNER_TEMP/identity-a.json" \
  LHM_STAGE0_IDENTITY_B="$RUNNER_TEMP/identity-b.json" \
  env "${UNSET_PROXY[@]}" node stage0-measure/run-config.js
) > "$LOGS/phase4-run-config-as-is.log" 2>&1
RC4=$?
if [ $RC4 -ne 0 ] && grep -q "requires Windows" "$LOGS/phase4-run-config-as-is.log"; then
  say "PHASE4 NOT_RUN_BY_DESIGN: stage0-measure/run-config.js unmodified refused on Linux with 'Real Camoufox Stage-0 measurement requires Windows' (exit $RC4) — the CI script itself can only be exercised by the Windows runner"
else
  say "PHASE4 UNEXPECTED: run-config.js did not refuse as designed (exit $RC4) — see phase4 log"; exit 2
fi

# ---------- Phase 5: rehearsal measurement on the real engine ----------
MEASURE_CMD="node stage0-measure/run-config-rehearsal.js"
(
  cd "$REPO_ROOT"
  LHM_CAMOUFOX_EXECUTABLE="$CAMOUFOX_BIN" \
  LHM_CAMOUFOX_EXE_SHA256="$CAMOUFOX_SHA256" \
  LHM_STAGE0_IDENTITY_A="$RUNNER_TEMP/identity-a.json" \
  LHM_STAGE0_IDENTITY_B="$RUNNER_TEMP/identity-b.json" \
  env "${UNSET_PROXY[@]}" xvfb-run -a $MEASURE_CMD
) > "$LOGS/phase5-measure.log" 2>&1
RC5=$?
REPORT="$REPO_ROOT/stage0-measure-results/stage0-config-rehearsal-report.json"
if [ -f "$REPORT" ]; then cp "$REPORT" "$WORK/stage0-config-rehearsal-report.json"; fi
if [ $RC5 -eq 0 ]; then
  say "PHASE5 PASS: rehearsal measurement completed — identity and storage both PASS on the real engine (details in the report)"
else
  say "PHASE5 RESULT_RECORDED: rehearsal measurement exit $RC5 — identity/storage verdicts are in the report; a FAIL here is a finding, not a script error"
fi

# ---------- Phase 6: evidence pack ----------
mkdir -p "$EVIDENCE_DIR"
cp "$LOGS/environment.txt" "$EVIDENCE_DIR/environment.txt"
cp "$LOGS"/phase*.log "$EVIDENCE_DIR/"
cp "$WORK/identity-a.summary.json" "$WORK/identity-b.summary.json" "$EVIDENCE_DIR/"
[ -f "$WORK/stage0-config-rehearsal-report.json" ] && \
  cp "$WORK/stage0-config-rehearsal-report.json" "$EVIDENCE_DIR/"
cp "$VERDICTS" "$EVIDENCE_DIR/verdicts.txt"
say "EVIDENCE: pack written to $EVIDENCE_DIR (full identities + scratch stay in $WORK)"
echo "---- verdicts ----"; cat "$VERDICTS"
exit $RC5
