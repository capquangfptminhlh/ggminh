#requires -version 7.0
# Operator-only: NEVER downloads any executable; uses disposable synthetic profiles.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$CamoufoxExe,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedExeSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if (-not $IsWindows) { throw 'Windows required' }
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not [IO.Path]::IsPathFullyQualified($CamoufoxExe)) { throw 'Expected absolute path' }
$resolved=(Resolve-Path -LiteralPath $CamoufoxExe).Path
if ([IO.Path]::GetFileName($resolved).ToLowerInvariant() -ne 'camoufox.exe') { throw 'Expected camoufox.exe' }
$hash=(Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $ExpectedExeSha256.ToLowerInvariant()) { throw 'EXE digest mismatch vs independently approved reference' }
$env:LHM_CAMOUFOX_EXECUTABLE=$resolved
$env:LHM_CAMOUFOX_EXE_SHA256=$ExpectedExeSha256.ToLowerInvariant()
Push-Location $repo
try {
 node --version
 if ($LASTEXITCODE -ne 0) { throw 'Node.js 20+ required' }
 if (-not (Test-Path './node_modules/playwright-core')) { throw 'Run npm ci in this checkout first' }
 & node ./stage0-measure/run.js
 if ($LASTEXITCODE -ne 0) { throw "Stage-0 FAIL/INCONCLUSIVE (exit $LASTEXITCODE); inspect JSON report" }
 Write-Host 'Local Stage-0 PASS. External network and installed product acceptance remain NOT_RUN.'
} finally {
 Pop-Location
 Remove-Item Env:LHM_CAMOUFOX_EXECUTABLE -ErrorAction SilentlyContinue
 Remove-Item Env:LHM_CAMOUFOX_EXE_SHA256 -ErrorAction SilentlyContinue
}
