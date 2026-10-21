#requires -version 5.1
param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [Parameter(Mandatory=$true)][string]$Manifest,
 [Parameter(Mandatory=$true)][string]$Destination
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
$root=[IO.Path]::GetFullPath($Destination).TrimEnd('\')+'\'
$doc=Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if($doc.engine -ne 'camoufox' -or $doc.entry -ne 'camoufox.exe'){ throw 'Wrong engine manifest identity' }
$expected=New-Object 'System.Collections.Generic.Dictionary[string,long]' ([StringComparer]::OrdinalIgnoreCase)
foreach($item in $doc.files){
 $name=[string]$item.path
 if($name.Length -gt 240 -or $name.Contains('\') -or $name.Contains(':') -or
    $name.StartsWith('/') -or $name.StartsWith('.') -or
    $name.Split('/') -contains '..' -or $name.Split('/') -contains '.'){
  throw 'Unsafe signed manifest file name'
 }
 $expected.Add($name,[long]$item.bytes)
}
$seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$zip=[IO.Compression.ZipFile]::OpenRead($Archive)
try{
 $total=[long]0
 foreach($entry in $zip.Entries){
  $name=[string]$entry.FullName
  if($name.Length -gt 240 -or $name.Contains('\') -or $name.Contains(':') -or
     $name.StartsWith('/') -or $name.StartsWith('.') -or
     $name.Split('/') -contains '..' -or $name.Split('/') -contains '.'){
    throw 'Unsafe ZIP entry'
  }
  if([string]::IsNullOrEmpty($entry.Name)){
   if(-not $name.EndsWith('/')){throw 'Invalid directory entry'}
   continue
  }
  if(-not $expected.ContainsKey($name)){throw ('Unlisted ZIP file: '+$name)}
  if(-not $seen.Add($name)){throw ('Duplicate ZIP file: '+$name)}
  if([long]$entry.Length -ne $expected[$name]){throw ('Wrong ZIP entry size: '+$name)}
  if([long]$entry.Length -gt 536870912){throw 'ZIP member too large'}
  $total += [long]$entry.Length
  if($total -gt 3221225472){throw 'ZIP expansion limit exceeded'}
  $type=([long]$entry.ExternalAttributes -shr 16) -band 61440
  if($type -eq 40960){throw 'ZIP symbolic link is not allowed'}
  $full=[IO.Path]::GetFullPath((Join-Path $root $name.Replace('/','\')))
  if(-not $full.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){
   throw 'ZIP member escapes target'
  }
 }
 if($seen.Count -ne $expected.Count){throw 'ZIP is missing signed files'}
 foreach($entry in $zip.Entries){
  if([string]::IsNullOrEmpty($entry.Name)){continue}
  $full=[IO.Path]::GetFullPath((Join-Path $root $entry.FullName.Replace('/','\')))
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($full))|Out-Null
  $inputStream=$entry.Open()
  $outputStream=$null
  try{
   $outputStream=New-Object IO.FileStream($full,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $inputStream.CopyTo($outputStream)
   $outputStream.Flush($true)
  }finally{
   if($outputStream){$outputStream.Dispose()}
   $inputStream.Dispose()
  }
 }
}finally{$zip.Dispose()}
Write-Host ('Extracted '+$seen.Count+' approved engine files')
