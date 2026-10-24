<#
.SYNOPSIS
  Read-only Gate 3 installer integrity preflight on an independent Windows PC.
.DESCRIPTION
  Verifies the manually supplied SHA-256 against actual installer bytes, then
  saves a privacy-minimal JSON checklist. Never executes installer, accesses
  license/profile/network data, or claims customer acceptance.
  Run and build identifiers are *operator supplied*, not GitHub-authenticated.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$BuildCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]{6,18}$')][string]$WindowsRunId,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) {
  throw 'This Gate 3 local preflight requires Windows'
}
if (-not [Environment]::Is64BitOperatingSystem) {
  throw 'This installer preflight requires Windows x64'
}
$resolved = Resolve-Path -LiteralPath $Installer -ErrorAction Stop
$actualFile = Get-Item -LiteralPath $resolved.Path -ErrorAction Stop
if (-not $actualFile.PSIsContainer -and $actualFile.Name -cmatch '^LHM-Ads-Browser-[0-9]+\.[0-9]+\.[0-9]+-Preview-Setup-x64\.exe$') {
  # Exact approved preview naming convention; EXE is read-only.
} else {
  throw 'Unexpected installer name or type; expected LHM-Ads-Browser-X.Y.Z-Preview-Setup-x64.exe'
}
if ($actualFile.Length -le 0 -or $actualFile.Length -gt 2147483648) {
  throw 'Installer size invalid; no report created'
}
$sha = (Get-FileHash -LiteralPath $actualFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -cne $ExpectedSha256.ToLowerInvariant()) {
  throw 'SHA-256 MISMATCH. STOP: this EXE differs from the expected GitHub build; do not install.'
}
# Optional OS metadata only; no username, computer name, serial, paths, or IP.
$osLabel = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
$osBuild = [Environment]::OSVersion.Version.ToString()
$authenticode = 'UNAVAILABLE'
try {
  $sig = Get-AuthenticodeSignature -LiteralPath $actualFile.FullName -ErrorAction Stop
  $authenticode = [string]$sig.Status
} catch {
  # Code signing is OPTIONAL. Status is informational, not a release gate.
}
$manual = @(
 'G3-02 Installation and Microsoft Defender',
 'G3-03 First run and limited trial UX',
 'G3-04 Chrome/Edge profile open and tab close',
 'G3-05 Camoufox verified engine (if included)',
 'G3-06 Real authenticated proxy, DNS and WebRTC',
 'G3-07 Real license activation and bound customer',
 'G3-08 Encrypted configuration backup and restore',
 'G3-09 Profile purge and residue checks',
 'G3-10 Real HTTPS verification and signed online update',
 'G3-11 Uninstall and process cleanup',
 'G3-12 Single-instance lock'
)
$checks = @(
 [ordered]@{ id='G3-01'; name='Exact downloaded EXE SHA-256 equals operator supplied CI digest'; status='PASS_LOCAL_HASH_MATCH'; evidence='Get-FileHash SHA256'; sourceAuthenticated=$false }
)
foreach ($item in $manual) {
  $parts = $item -split ' ',2
  $checks += [ordered]@{ id=$parts[0]; name=$parts[1]; status='NOT_RUN'; evidence=$null }
}
$report = [ordered]@{
  schema = 'lhm.gate3.local-preflight.v1'
  scope = 'READ_ONLY_INSTALLER_HASH_PREFLIGHT'
  producedAtUtc = [DateTime]::UtcNow.ToString('o')
  product = 'LHM Ads Browser'
  appVersion = [regex]::Match($actualFile.Name,'[0-9]+\.[0-9]+\.[0-9]+').Value
  buildCommit = $BuildCommit.ToLowerInvariant()
  windowsRunId = $WindowsRunId
  runAndCommitAuthenticatedAgainstGitHub = $false
  system = [ordered]@{ osDescription=$osLabel; osBuild=$osBuild; is64Bit=$true }
  installer = [ordered]@{
    fileName=$actualFile.Name; bytes=$actualFile.Length
    sha256=$sha; expectedSha256=$ExpectedSha256.ToLowerInvariant()
    integrity='PASS_LOCAL_HASH_MATCH'; authenticodeRequired=$false
    authenticodeStatus=$authenticode
  }
  privacy = 'No profile, token, cookie, customer, proxy or private filesystem path collected'
  checks = $checks
  outcome = 'NOT_APPROVED_FOR_COMMERCIAL_RELEASE'
  requiredNextStep = 'Complete manual Gate 3 checks on an independent installed Windows machine; attach redacted evidence and owner Gate 4 approval'
}
# Do not overwrite a previous acceptance report; each report is time-specific.
$dir = [IO.Path]::GetFullPath($OutputDirectory)
if (-not [IO.Directory]::Exists($dir)) {
  [void][IO.Directory]::CreateDirectory($dir)
}
$name = 'lhm-gate3-preflight-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fffffff') + '.json'
$dest = Join-Path $dir $name
$encoding = New-Object System.Text.UTF8Encoding($false)
$text = $report | ConvertTo-Json -Depth 8
$stream = New-Object System.IO.FileStream($dest,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
  $writer = New-Object System.IO.StreamWriter($stream,$encoding)
  try { $writer.Write($text) } finally { $writer.Dispose() }
} finally { $stream.Dispose() }
Write-Output ('Gate 3 READ-ONLY hash PASS; other checks NOT_RUN. JSON: ' + $dest)
