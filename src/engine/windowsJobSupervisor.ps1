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
 // 0=clear, 1=dialog, 2=unknown. Unknown remains blocking.
 public static int BlockingWindowState(IntPtr job){
  foreach(long id in ProcessIds(job)){
   System.Diagnostics.Process p=null;
   try{
    p=System.Diagnostics.Process.GetProcessById((int)id);
    bool member=false;
    if(!IsProcessInJob(p.Handle,job,out member))return 2;
    if(!member)continue;
    IntPtr window=p.MainWindowHandle;
    if(window==IntPtr.Zero||!IsWindowVisible(window)||IsWindowEnabled(window))continue;
    IntPtr popup=GetWindow(window,6); // GW_ENABLEDPOPUP
    if(popup!=IntPtr.Zero&&popup!=window&&IsWindowVisible(popup)&&IsWindowEnabled(popup))return 1;
   }catch(ArgumentException){ /* Process exited during enumeration. */ }
   catch{ return 2; } // Unknown window state must not force a shutdown.
   finally{if(p!=null)p.Dispose();}
  }
  return 0;
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
     $stopDeadline=[DateTime]::UtcNow.AddMilliseconds($stopGrace)
     $nextClose=[DateTime]::UtcNow
    }
    if($null -eq $instruction){$inputTask=$null}else{$inputTask=[LhmJobProbe]::ReadCommand()}
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
    }else{foreach($memberId in @([LhmJobProbe]::ProcessIds($job))){
     $member=$null
     $closeAttempts++
     try{
      $member=[Diagnostics.Process]::GetProcessById([int]$memberId);$inJob=$false
      if([LhmJobProbe]::IsProcessInJob($member.Handle,$job,[ref]$inJob) -and $inJob -and $member.CloseMainWindow()){$closeSent++}else{$closeNotSent++}
     }catch{$closeErrors++}finally{if($member){$member.Dispose()}}
    }}
    if($stopDeadline){$nextClose=[DateTime]::UtcNow.AddMilliseconds(500)}
   }
   if($stopDeadline -and [DateTime]::UtcNow -ge $stopDeadline -and [LhmJobProbe]::Active($job) -gt 0){
    if((GetWindowState $job) -ne 0){
     if(-not $dialogReported){SendSupervisorEvent '{"event":"dialog-blocked"}';$dialogReported=$true}
     $stopDeadline=[DateTime]::UtcNow.AddMilliseconds($stopGrace)
    }else{
     $closeForced=$true
     [LhmJobProbe]::Check([LhmJobProbe]::TerminateJobObject($job,1),'Stop remaining job processes')
     $stopDeadline=$null
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
