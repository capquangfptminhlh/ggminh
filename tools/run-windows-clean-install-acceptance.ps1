#Requires -Version 7.2
<#
.SYNOPSIS
  Evidence-only install/reinstall/uninstall observation on a disposable runner.
.DESCRIPTION
  Uses synthetic data below RUNNER_TEMP. It does not approve a release, exercise
  customer data, weaken Windows protections, or create an owner receipt.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BaselineInstaller,
  [Parameter(Mandatory=$true)][string]$CandidateInstaller,
  [Parameter(Mandatory=$true)][string]$BaselineEvidence,
  [Parameter(Mandatory=$true)][string]$CandidateEvidence,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+$')]
  [string]$ExpectedCandidateVersion
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

$script:OwnedProcesses=[Collections.Generic.List[Diagnostics.Process]]::new()
$script:Stage='startup'
$script:UninstallCompleted=$false

function Assert-UnderRoot([string]$Path,[string]$Root,[bool]$AllowRoot=$false) {
  $full=[IO.Path]::GetFullPath($Path)
  $base=[IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if(((-not $AllowRoot) -and $full -eq $base) -or
     (-not $full.StartsWith($base+[IO.Path]::DirectorySeparatorChar,
       [StringComparison]::OrdinalIgnoreCase))) {
    throw 'Acceptance path escapes RUNNER_TEMP'
  }
  return $full
}

function Resolve-InputFile([string]$Path,[string]$Root) {
  $full=Assert-UnderRoot -Path $Path -Root $Root
  $item=Get-Item -LiteralPath $full -Force
  if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Acceptance input must be a regular file'
  }
  return $item.FullName
}

function Invoke-Bounded(
  [string]$File,[string[]]$Arguments,[int]$TimeoutSeconds
) {
  $process=Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
  $script:OwnedProcesses.Add($process)
  if(-not $process.WaitForExit($TimeoutSeconds*1000)) {
    & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
    throw 'Bounded process timed out'
  }
  if($process.ExitCode -ne 0) {
    throw ('Bounded process exited '+$process.ExitCode)
  }
  return $process
}

function Stop-Owned([Diagnostics.Process]$Process) {
  if($null -eq $Process) { return }
  try {
    if(-not $Process.HasExited) {
      & taskkill.exe /PID $Process.Id /T /F 2>$null | Out-Null
      [void]$Process.WaitForExit(10000)
    }
  } catch { }
}

function Start-IsolatedApp(
  [string]$Executable,[string]$WorkingDirectory,[string]$AppData,
  [string]$LocalAppData,[string]$TempData,[string]$UserData,
  [string]$CaptureDirectory=''
) {
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$Executable
  $info.WorkingDirectory=$WorkingDirectory
  $info.UseShellExecute=$false
  $info.CreateNoWindow=$false
  $info.ArgumentList.Add('--user-data-dir='+$UserData)
  $info.Environment['APPDATA']=$AppData
  $info.Environment['LOCALAPPDATA']=$LocalAppData
  $info.Environment['TEMP']=$TempData
  $info.Environment['TMP']=$TempData
  if($CaptureDirectory) {
    $info.Environment['LHM_CI_UI_CAPTURE']='1'
    $info.Environment['LHM_CI_UI_CAPTURE_DIR']=$CaptureDirectory
  } else {
    $info.Environment['LHM_CI_INSTALL_ACCEPTANCE']='1'
    $info.Environment['LHM_CI_ACCEPTANCE_USER_DATA_DIR']=$UserData
  }
  $process=[Diagnostics.Process]::Start($info)
  if($null -eq $process) { throw 'Installed application did not start' }
  $script:OwnedProcesses.Add($process)
  return $process
}

function Wait-ForFileWhileAlive(
  [Diagnostics.Process]$Process,[string]$File,[int]$TimeoutSeconds
) {
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while([DateTime]::UtcNow -lt $deadline) {
    if(Test-Path -LiteralPath $File -PathType Leaf) { return }
    if($Process.HasExited) { throw 'Installed application exited before storage initialization' }
    Start-Sleep -Milliseconds 250
  }
  throw 'Installed application storage initialization timed out'
}

function Wait-UntilRemoved([string]$File,[int]$TimeoutSeconds) {
  $deadline=[DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while([DateTime]::UtcNow -lt $deadline) {
    if(-not (Test-Path -LiteralPath $File)) { return }
    Start-Sleep -Milliseconds 250
  }
  throw 'Installed executable remained after uninstall'
}

function Get-BuildIdentity([string]$EvidenceFile,[string]$InstallerFile) {
  $evidence=Get-Content -Raw -LiteralPath $EvidenceFile | ConvertFrom-Json
  $installer=Get-Item -LiteralPath $InstallerFile
  $sha=(Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $signature=Get-AuthenticodeSignature -LiteralPath $installer.FullName
  return [ordered]@{
    commit=[string]$evidence.build.commit
    runId=[string]$evidence.build.runId
    installerName=$installer.Name
    bytes=[long]$installer.Length
    sha256=$sha
    version=[string]$evidence.version
    authenticodeStatus=[string]$signature.Status
  }
}

function Assert-Captures([string]$CaptureRoot) {
  $names=@(
    'workspace-preview.png','workspace-expanded-preview.png',
    'workspace-command-preview.png','workspace-engine-provider-preview.png',
    'workspace-ads-guard-preview.png','workspace-performance-lab-preview.png',
    'workspace-about-update-preview.png','workspace-customer-handoff-preview.png',
    'workspace-license-preview.png','workspace-fleet-triage-preview.png',
    'workspace-agency-handoff-preview.png','workspace-profile-paging-preview.png'
  )
  foreach($name in $names) {
    $file=Get-Item -LiteralPath (Join-Path $CaptureRoot $name)
    if($file.Length -lt 10000) { throw 'Installed UI capture is undersized' }
  }
  return $names.Count
}

if(-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is required' }
$runnerRoot=[IO.Path]::GetFullPath($env:RUNNER_TEMP)
$outputRoot=Assert-UnderRoot -Path $OutputDirectory -Root $runnerRoot
if($outputRoot -match '\s') { throw 'Acceptance output path must not contain whitespace' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$diagnostic=Join-Path $outputRoot 'diagnostic.log'
$measurementFile=Join-Path $outputRoot 'measurement.json'
$installRoot=Join-Path $outputRoot 'installed'
$appData=Join-Path $outputRoot 'appdata'
$localAppData=Join-Path $outputRoot 'localappdata'
$tempData=Join-Path $outputRoot 'temp'
$captureRoot=Join-Path $outputRoot 'captures'
$baselineInstallerFile=Resolve-InputFile -Path $BaselineInstaller -Root $runnerRoot
$candidateInstallerFile=Resolve-InputFile -Path $CandidateInstaller -Root $runnerRoot
$baselineEvidenceFile=Resolve-InputFile -Path $BaselineEvidence -Root $runnerRoot
$candidateEvidenceFile=Resolve-InputFile -Path $CandidateEvidence -Root $runnerRoot
foreach($installerFile in @($baselineInstallerFile,$candidateInstallerFile)) {
  if([IO.Path]::GetFileName($installerFile) -notmatch
     '^LHM-Ads-Browser-[0-9]+\.[0-9]+\.[0-9]+-Preview-Setup-x64\.exe$') {
    throw 'Unexpected Windows installer name'
  }
}
$installedExe=Join-Path $installRoot 'LHM Ads Browser.exe'
$userData=Join-Path $outputRoot 'user-data'
$storageFile=Join-Path $userData 'storage\db.json'
$markerFile=Join-Path $userData 'storage\acceptance-synthetic-marker.txt'
$results=[ordered]@{
  baselineInstall='NOT_RUN';baselineLaunch='NOT_RUN';installOverExisting='NOT_RUN'
  candidateLaunch='NOT_RUN';packagedUiCapture='NOT_RUN';uninstall='NOT_RUN'
  processCleanup='NOT_RUN';retention='NOT_RUN'
}

try {
  foreach($dir in @($appData,$localAppData,$tempData,$captureRoot)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $script:Stage='baseline-install'
  Invoke-Bounded -File $baselineInstallerFile -Arguments @('/S',('/D='+$installRoot)) -TimeoutSeconds 180 | Out-Null
  if(-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
    throw 'Baseline installed executable missing'
  }
  $results.baselineInstall='PASS'

  $script:Stage='baseline-launch'
  $baselineProcess=Start-IsolatedApp -Executable $installedExe -WorkingDirectory $installRoot `
    -AppData $appData -LocalAppData $localAppData -TempData $tempData `
    -UserData $userData
  Wait-ForFileWhileAlive -Process $baselineProcess -File $storageFile -TimeoutSeconds 45
  Start-Sleep -Seconds 2
  if($baselineProcess.HasExited) { throw 'Baseline application exited during observation' }
  Stop-Owned -Process $baselineProcess
  & (Join-Path $PSScriptRoot 'stop-windows-install-processes.ps1') -InstallRoot $installRoot
  $results.baselineLaunch='PASS'
  $baselineStorageSha=(Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $markerText='LHM_SYNTHETIC_CONTINUITY_MARKER_V1'
  Set-Content -LiteralPath $markerFile -Value $markerText -NoNewline -Encoding utf8
  $markerSha=(Get-FileHash -LiteralPath $markerFile -Algorithm SHA256).Hash.ToLowerInvariant()

  $script:Stage='candidate-install-over-existing'
  Invoke-Bounded -File $candidateInstallerFile -Arguments @('/S',('/D='+$installRoot)) -TimeoutSeconds 180 | Out-Null
  if(-not (Test-Path -LiteralPath $installedExe -PathType Leaf)) {
    throw 'Candidate installed executable missing'
  }
  $productVersion=(Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
  if($productVersion -notmatch ('^'+[regex]::Escape($ExpectedCandidateVersion)+'(?:\.0)?$')) {
    throw 'Installed candidate product version mismatch'
  }
  $results.installOverExisting='PASS'

  $script:Stage='candidate-launch'
  $candidateProcess=Start-IsolatedApp -Executable $installedExe -WorkingDirectory $installRoot `
    -AppData $appData -LocalAppData $localAppData -TempData $tempData `
    -UserData $userData
  Wait-ForFileWhileAlive -Process $candidateProcess -File $storageFile -TimeoutSeconds 45
  Start-Sleep -Seconds 2
  if($candidateProcess.HasExited) { throw 'Candidate application exited during observation' }
  if(-not (Test-Path -LiteralPath $markerFile -PathType Leaf) -or
     (Get-FileHash -LiteralPath $markerFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $markerSha) {
    throw 'Synthetic continuity marker changed during install-over-existing'
  }
  Stop-Owned -Process $candidateProcess
  & (Join-Path $PSScriptRoot 'stop-windows-install-processes.ps1') -InstallRoot $installRoot
  $candidateStorageSha=(Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if($candidateStorageSha -ne $baselineStorageSha) {
    throw 'Application storage changed during install-over-existing'
  }
  $results.candidateLaunch='PASS'

  $script:Stage='installed-ui-capture'
  $captureProcess=Start-IsolatedApp -Executable $installedExe -WorkingDirectory $installRoot `
    -AppData $appData -LocalAppData $localAppData -TempData $tempData `
    -UserData $userData `
    -CaptureDirectory $captureRoot
  if(-not $captureProcess.WaitForExit(60000)) {
    Stop-Owned -Process $captureProcess
    throw 'Installed UI capture timed out'
  }
  if($captureProcess.ExitCode -ne 0) { throw 'Installed UI capture failed' }
  & (Join-Path $PSScriptRoot 'stop-windows-install-processes.ps1') -InstallRoot $installRoot
  $captureCount=Assert-Captures -CaptureRoot $captureRoot
  $results.packagedUiCapture='PASS'

  $script:Stage='uninstall'
  $uninstallers=@(Get-ChildItem -LiteralPath $installRoot -Filter 'Uninstall*.exe' -File)
  if($uninstallers.Count -ne 1) { throw 'Expected exactly one NSIS uninstaller' }
  $uninstaller=Assert-UnderRoot -Path $uninstallers[0].FullName -Root $installRoot
  Invoke-Bounded -File $uninstaller -Arguments @('/S') -TimeoutSeconds 180 | Out-Null
  $script:UninstallCompleted=$true
  Wait-UntilRemoved -File $installedExe -TimeoutSeconds 30
  $results.uninstall='PASS'
  & (Join-Path $PSScriptRoot 'stop-windows-install-processes.ps1') -InstallRoot $installRoot
  $results.processCleanup='PASS'
  if(-not (Test-Path -LiteralPath $storageFile -PathType Leaf) -or
     -not (Test-Path -LiteralPath $markerFile -PathType Leaf) -or
     (Get-FileHash -LiteralPath $markerFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $markerSha -or
     (Get-FileHash -LiteralPath $storageFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $candidateStorageSha) {
    throw 'Synthetic application data was not retained after uninstall'
  }
  $results.retention='PASS'

  $script:Stage='measurement'
  $measurement=[ordered]@{
    schema='lhm.windows-clean-install-measurement.v1'
    environmentClass='github-hosted-windows-ephemeral'
    hostedRunnerImage='windows-latest'
    baseline=Get-BuildIdentity -EvidenceFile $baselineEvidenceFile -InstallerFile $baselineInstallerFile
    candidate=Get-BuildIdentity -EvidenceFile $candidateEvidenceFile -InstallerFile $candidateInstallerFile
    results=$results
    markerSha256=$markerSha
    storageSha256=$candidateStorageSha
    uiCaptureCount=$captureCount
    privacy='Synthetic local data only; no customer, profile, token, cookie, proxy or network data'
  }
  $temporary=$measurementFile+'.tmp'
  $measurement | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding utf8NoBOM
  Move-Item -LiteralPath $temporary -Destination $measurementFile
  Write-Output ('Windows install evidence measurement PASS: '+[IO.Path]::GetFileName($measurementFile))
} catch {
  $category=$_.Exception.GetType().Name
  Set-Content -LiteralPath $diagnostic -Value ($script:Stage+"`t"+$category) -Encoding utf8NoBOM
  throw
} finally {
  foreach($owned in @($script:OwnedProcesses)) { Stop-Owned -Process $owned }
  try {
    & (Join-Path $PSScriptRoot 'stop-windows-install-processes.ps1') -InstallRoot $installRoot
  } catch { }
  if((-not $script:UninstallCompleted) -and (Test-Path -LiteralPath $installRoot -PathType Container)) {
    $cleanup=@(Get-ChildItem -LiteralPath $installRoot -Filter 'Uninstall*.exe' -File -ErrorAction SilentlyContinue)
    if($cleanup.Count -eq 1) {
      try {
        $safeCleanup=Assert-UnderRoot -Path $cleanup[0].FullName -Root $installRoot
        Invoke-Bounded -File $safeCleanup -Arguments @('/S') -TimeoutSeconds 180 | Out-Null
      } catch { }
    }
  }
}
