'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
const source=fs.readFileSync(path.join(__dirname,'../src/engine/windowsJobSupervisor.ps1'),'utf8');
const match=source.match(/Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/);assert(match,'Supervisor C# source missing');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-window-identity-')),file=path.join(root,'identity.ps1');
try{
 fs.writeFileSync(file,`$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${match[1]}\n'@\n`+String.raw`
Add-Type -AssemblyName System.Windows.Forms
$job=[LhmJobProbe]::CreateJobObject([IntPtr]::Zero,$null)
if($job -eq [IntPtr]::Zero){throw 'job create failed'}
$process=[Diagnostics.Process]::GetCurrentProcess()
if(-not [LhmJobProbe]::AssignProcessToJobObject($job,$process.Handle)){throw 'job assign failed'}
$form=New-Object Windows.Forms.Form;$form.Text='LHM synthetic identity';$form.Show()
try{
 $scan=[LhmJobProbe]::ScanWindows($job)
 if($scan.State -ne 0){throw ('scan unknown: '+$scan.State)}
 $matches=@($scan.Windows|Where-Object {$_.Handle -eq $form.Handle})
 if($matches.Count -ne 1){throw ('scan missing synthetic window; total='+$scan.Windows.Count)}
 $id=$matches[0]
 if([LhmJobProbe]::IdentityState($job,$id,$true) -ne 1){throw 'valid identity rejected'}
 $savedPid=$id.Pid;$id.Pid=$savedPid+1
 if([LhmJobProbe]::IdentityState($job,$id,$true) -ne 0){throw 'changed PID accepted'}
 $id.Pid=$savedPid;$id.Created=$id.Created+1
 if([LhmJobProbe]::IdentityState($job,$id,$true) -ne 0){throw 'changed creation time accepted'}
 $form.Enabled=$false;$scan=[LhmJobProbe]::ScanWindows($job)
 if($scan.State -ne 2){throw 'disabled window without popup must be unknown'}
}finally{$form.Dispose();$process.Dispose();[void][LhmJobProbe]::CloseHandle($job)}
`);
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-File',file],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr||result.error?.message||'identity fixture failed');
 console.log('Window identity rejects PID and creation-time changes: PASS');
}finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
