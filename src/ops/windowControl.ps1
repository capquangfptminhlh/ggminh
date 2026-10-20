# LHM Ads Browser v3.9 - Window management for owned local browser PIDs.
# This script does not send clicks, keys, read webpages or access user data.
param(
  [Parameter(Mandatory=$true)][ValidateSet("focus","grid","cascade")][string]$Mode,
  [Parameter(Mandatory=$true)][string]$Pids
)
$ErrorActionPreference="Stop"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LhmWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public delegate bool WindowVisitor(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(WindowVisitor visitor, IntPtr data);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hwnd, int x, int y, int width, int height, bool repaint);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint action, uint param, ref RECT rect, uint flags);
  public static IntPtr MainWindowForPid(uint expected) {
    IntPtr best=IntPtr.Zero;
    long bestArea=0;
    EnumWindows((hwnd,data)=>{
      uint pid;
      GetWindowThreadProcessId(hwnd,out pid);
      if (pid!=expected || !IsWindowVisible(hwnd) || GetWindow(hwnd,4)!=IntPtr.Zero) return true;
      RECT rect;
      if (!GetWindowRect(hwnd,out rect)) return true;
      long width=(long)rect.Right-rect.Left;
      long height=(long)rect.Bottom-rect.Top;
      if (width<130 || height<100) return true;
      long area=width*height;
      if (area>bestArea) {best=hwnd;bestArea=area;}
      return true;
    },IntPtr.Zero);
    return best;
  }
}
'@ -ErrorAction Stop

$numbers=@($Pids.Split(',') | ForEach-Object {
  $n=0
  if (-not [int]::TryParse($_,[ref]$n) -or $n -le 0) {throw "Invalid process ID"}
  $n
})
if ($numbers.Count -eq 0 -or $numbers.Count -gt 10 -or @($numbers|Select-Object -Unique).Count -ne $numbers.Count) {
  throw "Only 1-10 unique active browser PIDs supported"
}
if ($Mode -eq "focus" -and $numbers.Count -ne 1) {throw "Focus requires one profile"}
$screen=[LhmWin32+RECT]::new()
if (-not [LhmWin32]::SystemParametersInfo(48,0,[ref]$screen,0)) {
  throw "Cannot read primary display work area"
}
$screenWidth=$screen.Right-$screen.Left
$screenHeight=$screen.Bottom-$screen.Top
if ($screenWidth -lt 320 -or $screenHeight -lt 240) {throw "Invalid screen work area"}
$cols=[int][Math]::Ceiling([Math]::Sqrt($numbers.Count))
$rows=[int][Math]::Ceiling($numbers.Count / $cols)
$results=@()
for($i=0;$i -lt $numbers.Count;$i++){
  $pidValue=$numbers[$i]
  $handle=[LhmWin32]::MainWindowForPid([uint32]$pidValue)
  if($handle -eq [IntPtr]::Zero){
    $results+=@{pid=$pidValue;ok=$false;message="No top-level window for this PID"}
    continue
  }
  [void][LhmWin32]::ShowWindowAsync($handle,9)
  if($Mode -eq "focus"){
    $success=[LhmWin32]::SetForegroundWindow($handle)
    $results+=@{pid=$pidValue;ok=[bool]$success;message=$(if($success){"Focused"}else{"Windows refused foreground activation"})}
    continue
  }
  if($Mode -eq "grid"){
    $column=$i % $cols
    $line=[int][Math]::Floor($i / $cols)
    $x=$screen.Left+[int][Math]::Floor($column*$screenWidth/$cols)
    $y=$screen.Top+[int][Math]::Floor($line*$screenHeight/$rows)
    $width=[int][Math]::Floor(($column+1)*$screenWidth/$cols)-[int][Math]::Floor($column*$screenWidth/$cols)
    $height=[int][Math]::Floor(($line+1)*$screenHeight/$rows)-[int][Math]::Floor($line*$screenHeight/$rows)
  }else{
    $width=[int][Math]::Floor($screenWidth*0.72)
    $height=[int][Math]::Floor($screenHeight*0.72)
    $offset=32*$i
    $x=$screen.Left+[Math]::Min($offset,$screenWidth-$width)
    $y=$screen.Top+[Math]::Min($offset,$screenHeight-$height)
  }
  $success=[LhmWin32]::MoveWindow($handle,$x,$y,[Math]::Max($width,180),[Math]::Max($height,120),$true)
  $results+=@{pid=$pidValue;ok=[bool]$success;message=$(if($success){"Arranged"}else{"Windows refused to move the window"})}
}
[Console]::Out.WriteLine((ConvertTo-Json -InputObject @{mode=$Mode;results=@($results)} -Compress -Depth 4))
