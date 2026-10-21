#requires -version 7.0
<#
  One-off upstream Windows smoke on a hosted test runner. No deployment.
  No AV bypasses, Defender exclusions, or hidden engine downloads.
  Hash pinned to official GitHub Releases immutable asset digest.
#>
[CmdletBinding()]
param(
  [string]$ReleaseTag = 'v156.0.1-beta.36',
  [string]$ArchiveSha256 = '096fd4832a7a32f2aa7f7bdd07fe6253dda296cbe783acd7bc2c86cf5ae62031'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if ($ReleaseTag -ne 'v156.0.1-beta.36') { throw 'Release version is not in the audited allowlist' }
if ($ArchiveSha256 -ne '096fd4832a7a32f2aa7f7bdd07fe6253dda296cbe783acd7bc2c86cf5ae62031') {
  throw 'Release digest does not match the pinned upstream asset'
}
$base=Join-Path $env:RUNNER_TEMP 'lhm-camoufox-upstream-smoke'
$archive=Join-Path $base 'camoufox-win.x64.zip'
$browserRoot=Join-Path $base 'verified-browser'
New-Item -ItemType Directory -Force -Path $base,$browserRoot | Out-Null
$url="https://github.com/daijro/camoufox/releases/download/$ReleaseTag/camoufox-156.0.1-beta.36-win.x86_64.zip"
Write-Host ('Retrieving official test asset from GitHub Releases: '+$ReleaseTag)
& curl.exe --fail --location --show-error --silent --retry 2 --retry-delay 5 --connect-timeout 30 --output $archive $url
if ($LASTEXITCODE -ne 0) { throw "Official download failed (curl code $LASTEXITCODE)" }
$asset=(Get-Item $archive)
if ($asset.Length -ne 1311638126) { throw 'Official release ZIP size mismatch' }
$actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ArchiveSha256) { throw "Downloaded archive failed SHA-256 integrity check" }
Write-Host 'Official asset SHA-256 verified.'
# Expand-Archive does not silently install; extracted binaries remain inside
# ephemeral test workspace and are NEVER uploaded as build artifacts.
Expand-Archive -LiteralPath $archive -DestinationPath $browserRoot -Force
$resolved=(Resolve-Path $browserRoot).Path
$exe=Get-ChildItem -LiteralPath $browserRoot -Filter firefox.exe -Recurse -File -ErrorAction Stop |
  Where-Object { $_.FullName.StartsWith($resolved+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) } |
  Select-Object -First 1
if (-not $exe) {
  $candidates=@(Get-ChildItem -LiteralPath $browserRoot -Recurse -Force -File -ErrorAction Stop |
    Where-Object { $_.Extension -eq '.exe' } |
    Select-Object -First 30 -ExpandProperty FullName)
  Write-Host 'Extracted executable candidates:'
  foreach ($candidate in $candidates) {
    Write-Host (' - '+[IO.Path]::GetRelativePath($resolved,$candidate))
  }
  throw 'Official archive contains no firefox.exe. Review the upstream layout; do not guess or relabel a binary.'
}
# Reject linked files and tree escapes, including malicious archive surprises.
if (($exe.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Unexpected linked Firefox executable in extracted release'
}
$exePath=$exe.FullName
Write-Host ("Camoufox Windows executable located inside verified release: "+$exe.Name)
$scanState='unavailable'
try {
  $mp=Get-Command Start-MpScan -ErrorAction Stop
  $status=Get-MpComputerStatus -ErrorAction Stop
  if ($status.AntivirusEnabled -eq $true) {
    Start-MpScan -ScanType CustomScan -ScanPath $browserRoot -ErrorAction Stop
    $scanState='scan-completed'
    $found=@(Get-MpThreatDetection -ErrorAction SilentlyContinue |
      Where-Object { $_.Resources -match 'lhm-camoufox-upstream-smoke' })
    if ($found.Count -gt 0) { throw 'Defender reported a detection in upstream browser files' }
  } else { $scanState='defender-not-enabled-on-host' }
} catch {
  if ($_.Exception.Message -match 'Defender reported a detection') { throw }
  Write-Warning ("Defender scan not available on this runner: "+$_.Exception.Message)
}
Write-Host ("Defender verification: "+$scanState+" (not a clean bill of health if unavailable)")
if ($env:GITHUB_ENV) {
  "LHM_CAMOUFOX_EXECUTABLE=$exePath" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  "LHM_CAMOUFOX_SCAN_STATUS=$scanState" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}
Write-Host 'Upstream browser is staged for local headless Playwright smoke only.'
