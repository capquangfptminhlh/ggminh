# Read-only, synthetic evidence tests. Does NOT install EXE.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$collector=Join-Path (Split-Path -Parent $PSScriptRoot) 'tools/collect-windows-gate3.ps1'
if (-not (Test-Path -LiteralPath $collector)) { throw 'Gate 3 collector missing' }
$root=Join-Path ([IO.Path]::GetTempPath()) ('lhm-gate3-fixture-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
try {
  $exe=Join-Path $root 'LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe'
  [IO.File]::WriteAllBytes($exe,[Text.Encoding]::UTF8.GetBytes('SYNTHETIC TEST BYTES, NOT A REAL INSTALLER'))
  $sha=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
  $commit='a'*40
  $out=Join-Path $root 'accepted'
  $result=& $collector -Installer $exe -ExpectedSha256 $sha -BuildCommit $commit -WindowsRunId '40091087802' -OutputDirectory $out
  if (-not ($result -match 'hash PASS')) { throw 'Gate 3 collector did not report hash check' }
  $files=@(Get-ChildItem -LiteralPath $out -Filter '*.json' -File)
  if ($files.Count -ne 1) { throw 'Expected exactly one local JSON report' }
  $json=Get-Content -LiteralPath $files[0].FullName -Raw | ConvertFrom-Json
  if ($json.schema -ne 'lhm.gate3.local-preflight.v1' -or
      $json.installer.sha256 -ne $sha -or
      $json.installer.integrity -ne 'PASS_LOCAL_HASH_MATCH' -or
      $json.installer.authenticodeRequired -ne $false -or
      $json.outcome -ne 'NOT_APPROVED_FOR_COMMERCIAL_RELEASE' -or
      $json.runAndCommitAuthenticatedAgainstGitHub -ne $false) {
    throw 'Unexpected Gate 3 evidence fields'
  }
  if (@($json.checks | Where-Object { $_.status -eq 'PASS_LOCAL_HASH_MATCH' }).Count -ne 1) {
    throw 'Only local file SHA may be marked PASS'
  }
  if (@($json.checks | Where-Object { $_.status -eq 'NOT_RUN' }).Count -lt 9) {
    throw 'Manual checks must stay NOT_RUN'
  }
  if (($json | ConvertTo-Json -Depth 12) -match [regex]::Escape($root)) {
    throw 'Local absolute paths leaked into evidence'
  }
  $badOutput=Join-Path $root 'bad-hash'
  $badHash='b'*64
  if($sha -eq $badHash) { $badHash='c'*64 }
  $refused=$false
  try {
    & $collector -Installer $exe -ExpectedSha256 $badHash -BuildCommit $commit -WindowsRunId '40091087802' -OutputDirectory $badOutput | Out-Null
  } catch {
    if ($_.Exception.Message -match 'SHA-256 MISMATCH') { $refused=$true }
  }
  if (-not $refused -or (Test-Path -LiteralPath $badOutput)) {
    throw 'Wrong SHA was not blocked before writing evidence'
  }
  $secondOutput=Join-Path $root 'bad-name'
  $wrong=Join-Path $root 'random.exe'
  [IO.File]::WriteAllBytes($wrong,[Text.Encoding]::UTF8.GetBytes('SYNTHETIC TEST BYTES, NOT A REAL INSTALLER'))
  $badName=$false
  try {
    & $collector -Installer $wrong -ExpectedSha256 $sha -BuildCommit $commit -WindowsRunId '40091087802' -OutputDirectory $secondOutput | Out-Null
  } catch { $badName=$true }
  if (-not $badName -or (Test-Path -LiteralPath $secondOutput)) {
    throw 'Wrong installer name not blocked'
  }
  Write-Host 'Gate 3 offline SHA collector + privacy/minimal evidence + wrong-hash refusal PASS (synthetic fixtures)'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
