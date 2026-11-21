param([Parameter(Mandatory=$true)][string]$SignedEngineDirectory)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$engine = (Resolve-Path -LiteralPath $SignedEngineDirectory).Path
if (-not (Test-Path -LiteralPath $electron -PathType Leaf)) {
  throw 'Electron development runtime is not installed.'
}
if (-not (Test-Path -LiteralPath (Join-Path $engine 'camoufox.exe') -PathType Leaf)) {
  throw 'The supplied directory does not contain camoufox.exe.'
}
# Only the spawned source application receives these settings. Its verified
# engine manager checks the publisher signature and exact RC hash at runtime.
$oldMode = $env:LHM_CAMOUFOX_INTERNAL
$oldDirectory = $env:LHM_CAMOUFOX_INTERNAL_DIR
$oldProxyLab = $env:LHM_CAMOUFOX_PROXY_LAB
$oldPlaywrightLab = $env:LHM_CAMOUFOX_PLAYWRIGHT_LAB
try {
  $env:LHM_CAMOUFOX_INTERNAL = '1'
  $env:LHM_CAMOUFOX_INTERNAL_DIR = $engine
  Remove-Item Env:LHM_CAMOUFOX_PROXY_LAB -ErrorAction SilentlyContinue
  Remove-Item Env:LHM_CAMOUFOX_PLAYWRIGHT_LAB -ErrorAction SilentlyContinue
  Start-Process -FilePath $electron -ArgumentList @('"' + $root + '"') -WorkingDirectory $root | Out-Null
} finally {
  $env:LHM_CAMOUFOX_INTERNAL = $oldMode
  $env:LHM_CAMOUFOX_INTERNAL_DIR = $oldDirectory
  $env:LHM_CAMOUFOX_PROXY_LAB = $oldProxyLab
  $env:LHM_CAMOUFOX_PLAYWRIGHT_LAB = $oldPlaywrightLab
}
