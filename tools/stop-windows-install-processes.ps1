#Requires -Version 7.2
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$InstallRoot
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

function Assert-InstallRoot([string]$Path,[string]$RunnerTemp) {
  $runner=[IO.Path]::GetFullPath($RunnerTemp).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $root=[IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if($root -eq $runner -or -not $root.StartsWith(
      $runner+[IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Install root must be strictly below RUNNER_TEMP'
  }
  return $root
}

function Get-InstallProcesses([string]$Root) {
  $prefix=$Root+[IO.Path]::DirectorySeparatorChar
  return @(Get-CimInstance -ClassName Win32_Process | Where-Object {
    if([string]::IsNullOrWhiteSpace([string]$_.ExecutablePath)) { return $false }
    try {
      $executable=[IO.Path]::GetFullPath([string]$_.ExecutablePath)
      return $executable.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)
    } catch {
      return $false
    }
  })
}

function Assert-NoInstallProcesses([string]$Root) {
  $remaining=@(Get-InstallProcesses -Root $Root)
  if($remaining.Count -ne 0) {
    throw ('Installed executable process cleanup incomplete; count='+$remaining.Count)
  }
}

if(-not $env:RUNNER_TEMP) { throw 'RUNNER_TEMP is required' }
$safeRoot=Assert-InstallRoot -Path $InstallRoot -RunnerTemp $env:RUNNER_TEMP
$processes=@(Get-InstallProcesses -Root $safeRoot)
foreach($process in $processes) {
  & taskkill.exe /PID ([string]$process.ProcessId) /T /F 2>$null | Out-Null
}
$deadline=[DateTime]::UtcNow.AddSeconds(15)
do {
  $remaining=@(Get-InstallProcesses -Root $safeRoot)
  if($remaining.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
} while([DateTime]::UtcNow -lt $deadline)
Assert-NoInstallProcesses -Root $safeRoot
Write-Output ('Installed executable process cleanup PASS; terminated='+$processes.Count)
