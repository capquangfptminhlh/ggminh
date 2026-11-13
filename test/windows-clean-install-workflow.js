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
console.log('Windows clean-install runner contract PASS');
