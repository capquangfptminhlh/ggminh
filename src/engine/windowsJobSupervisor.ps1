$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class LhmJobProbe {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct STARTUPINFO {
  public int cb; public string lpReserved,lpDesktop,lpTitle; public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags; public short wShowWindow,cbReserved2; public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;
 }
 [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION { public IntPtr hProcess,hThread; public uint dwProcessId,dwThreadId; }
 [StructLayout(LayoutKind.Sequential)] public struct ACCOUNTING { public long TotalUserTime,TotalKernelTime,ThisPeriodTotalUserTime,ThisPeriodTotalKernelTime; public uint TotalPageFaultCount,TotalProcesses,ActiveProcesses,TotalTerminatedProcesses; }
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool inJob);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int infoClass,out ACCOUNTING info,uint size,IntPtr returned);
 [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)] public static extern bool QueryPids(IntPtr job,int infoClass,IntPtr buffer,uint size,IntPtr returned);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window,uint command);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool PostMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
 public delegate bool WindowCallback(IntPtr window,IntPtr state);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool EnumWindows(WindowCallback callback,IntPtr state);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
 public static void Check(bool ok,string operation){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error(),operation);}
 public static System.Threading.Tasks.Task<string> ReadCommand(){return System.Threading.Tasks.Task.Run(()=>Console.In.ReadLine());}
 public static uint Active(IntPtr job){ACCOUNTING value;Check(QueryInformationJobObject(job,1,out value,(uint)Marshal.SizeOf(typeof(ACCOUNTING)),IntPtr.Zero),"QueryInformationJobObject");return value.ActiveProcesses;}
 public static long[] ProcessIds(IntPtr job){
  const int size=8192;IntPtr buffer=Marshal.AllocHGlobal(size);
  try{for(int i=0;i<size;i++)Marshal.WriteByte(buffer,i,0);Check(QueryPids(job,3,buffer,size,IntPtr.Zero),"Query job process IDs");
   int count=Marshal.ReadInt32(buffer,4);if(count<0||count>(size-8)/IntPtr.Size)throw new InvalidOperationException("Invalid job process count");
   long[] ids=new long[count];for(int i=0;i<count;i++)ids[i]=Marshal.ReadIntPtr(buffer,8+i*IntPtr.Size).ToInt64();return ids;
  }finally{Marshal.FreeHGlobal(buffer);}
 }
 public sealed class WindowIdentity { public IntPtr Handle; public uint Pid; public long Created; public string Key {get{return Handle.ToInt64()+":"+Pid+":"+Created;}} }
 public sealed class ScanResult { public int State; public System.Collections.Generic.List<WindowIdentity> Windows=new System.Collections.Generic.List<WindowIdentity>(); }
 // Inspect every visible top-level job window, including secondary windows.
 // 0=clear, 1=dialog, 2=unknown. Unknown remains blocking.
 public static ScanResult ScanWindows(IntPtr job){
  var result=new ScanResult();var ids=new System.Collections.Generic.HashSet<long>(ProcessIds(job));
  bool ok=EnumWindows((window,state)=>{
   uint pid;GetWindowThreadProcessId(window,out pid);
   if(!ids.Contains(pid)||!IsWindowVisible(window))return true;
   try{
    using(var process=System.Diagnostics.Process.GetProcessById((int)pid)){
     bool member=false;if(!IsProcessInJob(process.Handle,job,out member)){result.State=2;return false;}
     if(!member)return true;
     if(!IsWindowEnabled(window)){
      IntPtr popup=GetWindow(window,6);
      if(popup!=IntPtr.Zero&&popup!=window&&IsWindowVisible(popup)&&IsWindowEnabled(popup))result.State=1;
      else if(result.State!=1)result.State=2;
     }
     if(GetWindow(window,4)==IntPtr.Zero)result.Windows.Add(new WindowIdentity{Handle=window,Pid=pid,Created=process.StartTime.ToUniversalTime().Ticks}); // GW_OWNER
    }
   }catch(ArgumentException){}catch{result.State=2;return false;}
   return result.State!=2;
  },IntPtr.Zero);
  if(!ok&&result.State!=2)result.State=2;
  return result;
 }
 public static int BlockingWindowState(IntPtr job){return ScanWindows(job).State;}
 public static int IdentityState(IntPtr job,WindowIdentity identity,bool requireEnabled){
  IntPtr window=identity.Handle;if(!IsWindow(window))return 0;uint pid;GetWindowThreadProcessId(window,out pid);
  if(pid==0)return 2;if(pid!=identity.Pid)return 0;
  try{using(var process=System.Diagnostics.Process.GetProcessById((int)pid)){
   if(process.StartTime.ToUniversalTime().Ticks!=identity.Created)return 0;
   bool member=false;if(!IsProcessInJob(process.Handle,job,out member))return 2;if(!member)return 0;
   uint recheck;GetWindowThreadProcessId(window,out recheck);
   if(!IsWindow(window)||pid!=recheck)return 0;
   if(requireEnabled&&(!IsWindowVisible(window)||!IsWindowEnabled(window)||GetWindow(window,4)!=IntPtr.Zero))return 2;
   return 1;
  }}catch(ArgumentException){return 0;}catch{return 2;}
 }
}
'@
 function SendSupervisorEvent([string]$value){try{[Console]::Out.WriteLine($value);[Console]::Out.Flush()}catch{}}
 $script:lastWindowState=-1
 function GetWindowState([IntPtr]$jobHandle){
  $value=[LhmJobProbe]::BlockingWindowState($jobHandle)
  if($value -ne $script:lastWindowState){
   if($value -eq 0){SendSupervisorEvent '{"event":"window-state","state":"clear"}'}
   elseif($value -eq 1){SendSupervisorEvent '{"event":"window-state","state":"dialog"}'}
   else{SendSupervisorEvent '{"event":"window-state","state":"unknown"}'}
   $script:lastWindowState=$value
  }
  return $value
 }
 [Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
 $line=[Console]::In.ReadLine()
 if(-not $line -or $line.Length -gt 65536){throw 'Invalid supervisor request'}
 $request=$line|ConvertFrom-Json
 if($request.job -notmatch '^Local\\LhmJob-[0-9a-f]{48}$' -or
    -not [IO.Path]::IsPathRooted([string]$request.executable) -or
    -not (Test-Path -LiteralPath $request.executable -PathType Leaf) -or
    $null -eq $request.args -or @($request.args).Count -gt 128){SendSupervisorEvent '{"event":"aborted"}';throw 'Invalid supervisor request'}
 $stopGrace=[int]$request.stopGraceMs
 if($stopGrace -lt 100 -or $stopGrace -gt 10000){throw 'Invalid stop grace period'}
 $proofPath=$null
 if($request.evidence){
  $ev=$request.evidence
  if($ev.token -notmatch '^[0-9a-f]{48}$' -or $request.job -ne ('Local\LhmJob-'+$ev.token) -or
     $ev.jobName -ne $request.job -or -not [IO.Path]::IsPathRooted([string]$ev.path) -or
     -not ([IO.Path]::GetFileName([string]$ev.path).EndsWith('.'+$ev.token+'.done'))){throw 'Invalid completion evidence target'}
  $proofPath=[IO.Path]::GetFullPath([string]$ev.path)
 }
 function QuoteArgument([string]$text){
  $builder=[Text.StringBuilder]::new();[void]$builder.Append('"');$slashes=0
  foreach($char in $text.ToCharArray()){
   if($char -eq [char]92){$slashes++;continue}
   if($char -eq [char]34){[void]$builder.Append([char]92,($slashes*2+1));[void]$builder.Append($char);$slashes=0;continue}
   [void]$builder.Append([char]92,$slashes);$slashes=0;[void]$builder.Append($char)
  }
  [void]$builder.Append([char]92,($slashes*2));[void]$builder.Append('"');return $builder.ToString()
 }
 $arguments=@([string]$request.executable)+@($request.args|ForEach-Object {[string]$_})
 foreach($arg in $arguments){if($arg.Contains([char]0)){throw 'Invalid command line argument'}}
 $command=[Text.StringBuilder]::new((($arguments|ForEach-Object {QuoteArgument $_}) -join ' '))
 $job=[IntPtr]::Zero;$pi=[LhmJobProbe+PROCESS_INFORMATION]::new();$resumed=$false;$resumeAuthorized=$false
 try{
  $job=[LhmJobProbe]::CreateJobObject([IntPtr]::Zero,$request.job)
  $jobError=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if($job -eq [IntPtr]::Zero -or $jobError -eq 183){throw 'Job name is unavailable'}
  $si=[LhmJobProbe+STARTUPINFO]::new();$si.cb=[Runtime.InteropServices.Marshal]::SizeOf([type][LhmJobProbe+STARTUPINFO])
  # The bridge must observe this before any process can be created.
  [Console]::Out.WriteLine('{"event":"creating"}');[Console]::Out.Flush()
  [LhmJobProbe]::Check([LhmJobProbe]::CreateProcess($request.executable,$command,[IntPtr]::Zero,[IntPtr]::Zero,$false,0x08000004,[IntPtr]::Zero,[IO.Path]::GetDirectoryName($request.executable),[ref]$si,[ref]$pi),'Create suspended process')
  [LhmJobProbe]::Check([LhmJobProbe]::AssignProcessToJobObject($job,$pi.hProcess),'Assign process to job')
  SendSupervisorEvent (([pscustomobject]@{event='started';pid=$pi.dwProcessId}|ConvertTo-Json -Compress))
  if([Console]::In.ReadLine() -ne 'RESUME'){throw 'Supervisor was not authorized to resume the suspended process'}
  $resumeAuthorized=$true
  [LhmJobProbe]::Check(([LhmJobProbe]::ResumeThread($pi.hThread) -ne [uint32]::MaxValue),'Resume process');$resumed=$true
  SendSupervisorEvent '{"event":"resumed"}'
  $reported=$false;$dialogReported=$false;$stopDeadline=$null;$nextClose=$null;$inputTask=[LhmJobProbe]::ReadCommand()
  $closeAttempts=0;$closeSent=0;$closeNotSent=0;$closeErrors=0;$closeForced=$false
  $stopCloseSent=0;$slowWait=$false;$outstandingWindow=$null
  $attemptedWindows=[Collections.Generic.HashSet[string]]::new()
  function CloseNextWindow {
   if($null -ne $outstandingWindow){
    if([LhmJobProbe]::IdentityState($job,$outstandingWindow,$false) -ne 0){return}
    $script:outstandingWindow=$null
   }
   $scan=[LhmJobProbe]::ScanWindows($job)
   if($scan.State -ne 0){return}
   foreach($window in $scan.Windows){
    if($attemptedWindows.Contains($window.Key)){continue}
    if((GetWindowState $job) -ne 0){return}
    if([LhmJobProbe]::IdentityState($job,$window,$true) -ne 1){return}
    [void]$attemptedWindows.Add($window.Key)
    $script:closeAttempts++
    if([LhmJobProbe]::PostMessage($window.Handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)){
     $script:closeSent++;$script:stopCloseSent++;$script:outstandingWindow=$window
    }else{$script:closeNotSent++}
    return
   }
  }
  function SendCloseSummary {
   SendSupervisorEvent (([pscustomobject]@{event='close-summary';attempts=$closeAttempts;sent=$closeSent;notSent=$closeNotSent;errors=$closeErrors;forced=$closeForced}|ConvertTo-Json -Compress))
  }
  while($true){
   if($inputTask -and $inputTask.IsCompleted){
    $instruction=$inputTask.GetAwaiter().GetResult()
    if($instruction -eq 'FORCE'){
     $closeForced=$true
     [LhmJobProbe]::Check([LhmJobProbe]::TerminateJobObject($job,1),'Force stop job processes')
    }
    if($instruction -eq 'STOP' -and -not $stopDeadline){
     $slowWait=$false
     $stopCloseSent=0
     $outstandingWindow=$null;$attemptedWindows.Clear()
     $stopDeadline=[DateTime]::UtcNow.AddMilliseconds($stopGrace)
     $nextClose=[DateTime]::UtcNow
    }
    if($null -eq $instruction){$inputTask=$null}else{$inputTask=[LhmJobProbe]::ReadCommand()}
   }
   if($slowWait -and [DateTime]::UtcNow -ge $nextClose){
    if((GetWindowState $job) -ne 0){
     if(-not $dialogReported){SendSupervisorEvent '{"event":"dialog-blocked"}';$dialogReported=$true}
    }elseif($dialogReported){
     SendSupervisorEvent '{"event":"dialog-cleared"}';$dialogReported=$false
     $slowWait=$false;$nextClose=$null
    }else{CloseNextWindow}
    if($slowWait){$nextClose=[DateTime]::UtcNow.AddMilliseconds(500)}
   }
   if($stopDeadline -and [DateTime]::UtcNow -ge $nextClose){
    if((GetWindowState $job) -ne 0){
     # Let the person answer the browser dialog before attempting to close.
     if(-not $dialogReported){SendSupervisorEvent '{"event":"dialog-blocked"}';$dialogReported=$true}
     $stopDeadline=[DateTime]::UtcNow.AddMilliseconds($stopGrace)
    }elseif($dialogReported){
     # The person may have canceled a close confirmation. Do not retry it.
     SendSupervisorEvent '{"event":"dialog-cleared"}';$dialogReported=$false
     $stopDeadline=$null;$nextClose=$null
    }else{CloseNextWindow}
    if($stopDeadline){$nextClose=[DateTime]::UtcNow.AddMilliseconds(500)}
   }
   if($stopDeadline -and [DateTime]::UtcNow -ge $stopDeadline -and [LhmJobProbe]::Active($job) -gt 0){
    if((GetWindowState $job) -ne 0){
     if(-not $dialogReported){SendSupervisorEvent '{"event":"dialog-blocked"}';$dialogReported=$true}
     $stopDeadline=[DateTime]::UtcNow.AddMilliseconds($stopGrace)
    }else{
     # No timeout proves a process is no longer flushing data.
     SendSupervisorEvent '{"event":"close-slow"}'
     $stopDeadline=$null;$slowWait=$true;$nextClose=[DateTime]::UtcNow.AddMilliseconds(500)
    }
   }
   if(-not $reported -and [LhmJobProbe]::WaitForSingleObject($pi.hProcess,0) -eq 0){
    [uint32]$code=0;[LhmJobProbe]::Check([LhmJobProbe]::GetExitCodeProcess($pi.hProcess,[ref]$code),'Get exit code')
    SendSupervisorEvent (([pscustomobject]@{event='root-exited';code=$code}|ConvertTo-Json -Compress));$reported=$true
   }
   if($reported -and [LhmJobProbe]::Active($job) -eq 0){
    SendCloseSummary
    if($proofPath){
     $value=[pscustomobject]@{jobName=$request.job;token=$request.evidence.token;active=0}|ConvertTo-Json -Compress
     $bytes=[Text.UTF8Encoding]::new($false).GetBytes($value)
     $stream=[IO.File]::Open($proofPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
     try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    }
    SendSupervisorEvent '{"event":"empty"}';break
   }
   Start-Sleep -Milliseconds 100
  }
 }catch{
  if(-not $resumeAuthorized){
   $safe=$true
   if($pi.hProcess -ne [IntPtr]::Zero -and [LhmJobProbe]::WaitForSingleObject($pi.hProcess,0) -ne 0){
    $safe=[LhmJobProbe]::TerminateProcess($pi.hProcess,1) -and [LhmJobProbe]::WaitForSingleObject($pi.hProcess,5000) -eq 0
   }
   if($safe -and ($job -eq [IntPtr]::Zero -or [LhmJobProbe]::Active($job) -eq 0)){SendSupervisorEvent '{"event":"aborted"}'}
  }
  throw
 }finally{
  if($pi.hProcess -ne [IntPtr]::Zero -and -not $resumed){[void][LhmJobProbe]::TerminateProcess($pi.hProcess,1)}
  if($pi.hThread -ne [IntPtr]::Zero){[void][LhmJobProbe]::CloseHandle($pi.hThread)}
  if($pi.hProcess -ne [IntPtr]::Zero){[void][LhmJobProbe]::CloseHandle($pi.hProcess)}
  if($job -ne [IntPtr]::Zero){[void][LhmJobProbe]::CloseHandle($job)}
 }
