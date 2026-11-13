'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'..');
const psFile=path.join(root,'tools','run-windows-clean-install-acceptance.ps1');
assert(fs.existsSync(psFile),'PowerShell acceptance runner missing');
const ps=fs.readFileSync(psFile,'utf8');
for(const token of [
 'Set-StrictMode -Version Latest','[IO.Path]::GetFullPath','RUNNER_TEMP',
 'LHM-Ads-Browser-','-Preview-Setup-x64','/S','/D=',
 'APPDATA','LOCALAPPDATA','LHM_CI_UI_CAPTURE','LHM_CI_UI_CAPTURE_DIR',
 'storage\\db.json','acceptance-synthetic-marker.txt','Get-AuthenticodeSignature',
 'WaitForExit','taskkill.exe','/PID','/T',
 'lhm.windows-clean-install-measurement.v1','github-hosted-windows-ephemeral'
]) assert(ps.includes(token),`runner contract missing ${token}`);
assert(!/Get-Process\s+[^\r\n]*LHM/i.test(ps),
 'cleanup must not match a broad process name');
assert(!/Stop-Process\s+[^\r\n]*-Name/i.test(ps),
 'cleanup must be PID-scoped');
assert(!/Set-MpPreference|DisableRealtimeMonitoring|SmartScreenEnabled/i.test(ps),
 'runner must not weaken Windows protection');

const workflowFile=path.join(root,'.github','workflows',
 'windows-clean-install-acceptance.yml');
assert(fs.existsSync(workflowFile),'manual clean-install workflow missing');
const workflow=fs.readFileSync(workflowFile,'utf8');
for(const token of [
 'workflow_dispatch:','candidate_run_id:','baseline_run_id:',
 'contents: read','actions: read','runs-on: windows-latest','timeout-minutes:',
 '.github/workflows/windows-exe.yml','head_branch','head_repository',
 'compare/','LHM-Ads-Browser-Windows-x64','LHM-Release-Evidence-Windows',
 'verify-build','run-windows-clean-install-acceptance.ps1',
 'windows-clean-install-evidence.js build','if: always()',
 'LHM-Windows-Clean-Install-Evidence','AUTOMATED_HOSTED_RUNNER_EVIDENCE_ONLY'
]) assert(workflow.includes(token),`workflow contract missing ${token}`);
assert(!workflow.includes('contents: write'));
assert(!/gh release (create|edit|upload)/.test(workflow));
assert(!/capabilities\.json/.test(workflow));
assert(!/publisher-ceremony|ownerApprovalId|READY_FOR_OWNER_REVIEW/.test(workflow));
console.log('Windows clean-install runner contract PASS');
