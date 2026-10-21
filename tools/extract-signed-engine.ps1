#requires -version 5.1
# Extract only a caller-verified, publisher-signed allowlist of engine files.
# No shell execution of archive contents, AV exclusions or unsigned extras.
param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [Parameter(Mandatory=$true)][string]$Manifest,
 [Parameter(Mandatory=$true)][string]$Destination
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
$target=[System.IO.Path]::GetFullPath($Destination).TrimEnd('\')+'\'
$doc=Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($doc.engine -ne 'camoufox' -or $doc.entry -ne 'camoufox.exe') {
 throw 'Wrong signed engine identity'
}
$expected=New-Object 'System.Collections.Generic.Dictionary[string,long]' ([StringComparer]::OrdinalIgnoreCase)
foreach($file in $doc.files) {
 $p=[string]$file.path
 if ($p.Length -gt 240 -or $p -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9_.-]*(/[a-zA-Z0-9_][a-zA-Z0-9_.-]*)*$') {
  throw 'Untrusted archive path'
 }
 if ($p.Split('/') -contains '..' -or $p.Split('/') -contains '.') { throw 'Archive path traversal rejected' }
 $expected.Add($p,[long]$file.bytes)
}
$actual=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$zip=[System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
 $total=[long]0
 # Scan *all entries before extracting any bytes*, including directory names.
 foreach($entry in $zip.Entries){
  $name=[string]$entry.FullName
  if($name.Contains('\') -or $name.StartsWith('/') -or $name.StartsWith('.') -or
     $name.Contains(':') -or $name.Contains([char]0) -or $name.Length -gt 240){
   throw 'Unsafe ZIP entry name'
  }
  if([string]::IsNullOrWhiteSpace($entry.Name)){
   if(-not $name.EndsWith('/')){throw 'Unexpected ZIP directory entry'}
   $prefix=$name.TrimEnd('/')
   if($prefix -eq '' -or $prefix -notmatch '^[a-zA-Z0-9_][a-zA-Z0-9_.-]*(/[a-zA-Z0-9_][a-zA-Z0-9_.-]*)*
    throw 'Unsafe ZIP directory'
   }
   continue
  }
  if(-not $expected.ContainsKey($name)){throw 'Unlisted ZIP file: '+$name}
  if(-not $actual.Add($name)){throw 'Duplicate ZIP file: '+$name}
  if([long]$entry.Length -ne $expected[$name]){throw 'ZIP declared file-size mismatch: '+$name}
  if([long]$entry.Length -gt 512MB){throw 'ZIP file exceeds maximum size'}
  $total += [long]$entry.Length
  if($total -gt 3GB){throw 'ZIP release exceeds total size budget'}
  $unixType=([long]$entry.ExternalAttributes -shr 16) -band 61440
  if($unixType -eq 40960){throw 'ZIP symbolic link is forbidden'}
  $full=[IO.Path]::GetFullPath((Join-Path $target $name.Replace('/','\')))
  if(-not $full.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)){
   throw 'ZIP path escapes destination'
  }
 }
 if($actual.Count -ne $expected.Count){throw 'ZIP does not include every signed manifest file'}
 foreach($entry in $zip.Entries){
  if([string]::IsNullOrWhiteSpace($entry.Name)){continue}
  $full=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName.Replace('/','\')))
  $folder=[IO.Path]::GetDirectoryName($full)
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $source=$entry.Open()
  $destinationFile=$null
  try{
   $destinationFile=New-Object IO.FileStream($full,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $source.CopyTo($destinationFile)
   $destinationFile.Flush($true)
  }finally{
   if($destinationFile){$destinationFile.Dispose()}
   $source.Dispose()
  }
 }
}finally{$zip.Dispose()}
Write-Host ('Extracted '+$actual.Count+' signed, named engine resource files.')
)){
    throw 'Unsafe ZIP directory'
   }
   continue
  }
  if(-not $expected.ContainsKey($name)){throw 'Unlisted ZIP file: '+$name}
  if(-not $actual.Add($name)){throw 'Duplicate ZIP file: '+$name}
  if([long]$entry.Length -ne $expected[$name]){throw 'ZIP declared file-size mismatch: '+$name}
  if([long]$entry.Length -gt 512MB){throw 'ZIP file exceeds maximum size'}
  $total += [long]$entry.Length
  if($total -gt 3GB){throw 'ZIP release exceeds total size budget'}
  $unixType=([long]$entry.ExternalAttributes -shr 16) -band 61440
  if($unixType -eq 40960){throw 'ZIP symbolic link is forbidden'}
  $full=[IO.Path]::GetFullPath((Join-Path $target $name.Replace('/','\')))
  if(-not $full.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)){
   throw 'ZIP path escapes destination'
  }
 }
 if($actual.Count -ne $expected.Count){throw 'ZIP does not include every signed manifest file'}
 foreach($entry in $zip.Entries){
  if([string]::IsNullOrWhiteSpace($entry.Name)){continue}
  $full=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName.Replace('/','\')))
  $folder=[IO.Path]::GetDirectoryName($full)
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $source=$entry.Open()
  $destinationFile=$null
  try{
   $destinationFile=New-Object IO.FileStream($full,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $source.CopyTo($destinationFile)
   $destinationFile.Flush($true)
  }finally{
   if($destinationFile){$destinationFile.Dispose()}
   $source.Dispose()
  }
 }
}finally{$zip.Dispose()}
Write-Host ('Extracted '+$actual.Count+' signed, named engine resource files.')
){
    throw 'Unsafe ZIP directory'
   }
   continue
  }
  if(-not $expected.ContainsKey($name)){throw 'Unlisted ZIP file: '+$name}
  if(-not $actual.Add($name)){throw 'Duplicate ZIP file: '+$name}
  if([long]$entry.Length -ne $expected[$name]){throw 'ZIP declared file-size mismatch: '+$name}
  if([long]$entry.Length -gt 512MB){throw 'ZIP file exceeds maximum size'}
  $total += [long]$entry.Length
  if($total -gt 3GB){throw 'ZIP release exceeds total size budget'}
  $unixType=([long]$entry.ExternalAttributes -shr 16) -band 61440
  if($unixType -eq 40960){throw 'ZIP symbolic link is forbidden'}
  $full=[IO.Path]::GetFullPath((Join-Path $target $name.Replace('/','\')))
  if(-not $full.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)){
   throw 'ZIP path escapes destination'
  }
 }
 if($actual.Count -ne $expected.Count){throw 'ZIP does not include every signed manifest file'}
 foreach($entry in $zip.Entries){
  if([string]::IsNullOrWhiteSpace($entry.Name)){continue}
  $full=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName.Replace('/','\')))
  $folder=[IO.Path]::GetDirectoryName($full)
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $source=$entry.Open()
  $destinationFile=$null
  try{
   $destinationFile=New-Object IO.FileStream($full,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $source.CopyTo($destinationFile)
   $destinationFile.Flush($true)
  }finally{
   if($destinationFile){$destinationFile.Dispose()}
   $source.Dispose()
  }
 }
}finally{$zip.Dispose()}
Write-Host ('Extracted '+$actual.Count+' signed, named engine resource files.')
)){
    throw 'Unsafe ZIP directory'
   }
   continue
  }
  if(-not $expected.ContainsKey($name)){throw 'Unlisted ZIP file: '+$name}
  if(-not $actual.Add($name)){throw 'Duplicate ZIP file: '+$name}
  if([long]$entry.Length -ne $expected[$name]){throw 'ZIP declared file-size mismatch: '+$name}
  if([long]$entry.Length -gt 512MB){throw 'ZIP file exceeds maximum size'}
  $total += [long]$entry.Length
  if($total -gt 3GB){throw 'ZIP release exceeds total size budget'}
  $unixType=([long]$entry.ExternalAttributes -shr 16) -band 61440
  if($unixType -eq 40960){throw 'ZIP symbolic link is forbidden'}
  $full=[IO.Path]::GetFullPath((Join-Path $target $name.Replace('/','\')))
  if(-not $full.StartsWith($target,[StringComparison]::OrdinalIgnoreCase)){
   throw 'ZIP path escapes destination'
  }
 }
 if($actual.Count -ne $expected.Count){throw 'ZIP does not include every signed manifest file'}
 foreach($entry in $zip.Entries){
  if([string]::IsNullOrWhiteSpace($entry.Name)){continue}
  $full=[IO.Path]::GetFullPath((Join-Path $target $entry.FullName.Replace('/','\')))
  $folder=[IO.Path]::GetDirectoryName($full)
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $source=$entry.Open()
  $destinationFile=$null
  try{
   $destinationFile=New-Object IO.FileStream($full,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
   $source.CopyTo($destinationFile)
   $destinationFile.Flush($true)
  }finally{
   if($destinationFile){$destinationFile.Dispose()}
   $source.Dispose()
  }
 }
}finally{$zip.Dispose()}
Write-Host ('Extracted '+$actual.Count+' signed, named engine resource files.')
