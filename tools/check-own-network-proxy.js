'use strict';
// One-use, loopback-only proxy. Only example.com:443 and the synthetic
// loopback origin are reachable; no credentials or client IPs are logged.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),net=require('node:net'),tls=require('node:tls'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const Store=require('../src/db/store'),BrowserLauncher=require('../src/engine/browserLauncher');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(process.platform!=='win32')throw Error('Windows required');
const engines=[['chromium','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
 ['gecko','C:\\Program Files\\Mozilla Firefox\\firefox.exe']];
function listen(server){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port)})})}
function close(server){return new Promise(resolve=>server.close(()=>resolve()))}
function networkCheck(proxyPort){return new Promise((resolve,reject)=>{
 const req=http.request({host:'127.0.0.1',port:proxyPort,method:'CONNECT',path:'example.com:443',timeout:15000});
 req.on('timeout',()=>req.destroy(Error('Network proxy check timed out')));req.on('error',reject);
 req.on('connect',(res,socket)=>{
  if(res.statusCode!==200){socket.destroy();reject(Error('Network proxy CONNECT rejected'));return}
  const secured=tls.connect({socket,servername:'example.com',rejectUnauthorized:true});let buffer='';
  secured.setTimeout(15000,()=>secured.destroy(Error('Network TLS check timed out')));
  secured.on('error',reject);secured.once('secureConnect',()=>secured.write('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'));
  secured.on('data',chunk=>{buffer+=chunk.toString('latin1');if(buffer.length>8192)secured.destroy()});
  secured.on('close',()=>{const m=/^HTTP\/1\.[01] (\d{3})/.exec(buffer);if(!m||Number(m[1])<200||Number(m[1])>=400)reject(Error('Unexpected example.com response'));else resolve(Number(m[1]))});
 });req.end();
})}
function readAttemptCount(rootPid,fixtureRoot,profileId){
 if(!Number.isSafeInteger(rootPid)||rootPid<=0||!/^pb_[a-f0-9]+$/i.test(profileId))throw Error('Invalid synthetic browser process');
 const command=String.raw`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$rootPid=[int]$env:LHM_SYNTHETIC_PID
$all=Get-CimInstance Win32_Process;$root=@($all|Where-Object {$_.ProcessId -eq $rootPid})
if($root.Count -ne 1 -or -not $root[0].CommandLine.Contains($env:LHM_SYNTHETIC_ROOT) -or -not $root[0].CommandLine.Contains($env:LHM_SYNTHETIC_PROFILE)){exit 3}
$ids=@($rootPid);do {$old=$ids.Count;$ids=@($ids)+@($all|Where-Object {$ids -contains $_.ParentProcessId}|ForEach-Object ProcessId)|Select-Object -Unique} while($ids.Count -gt $old)
Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object {$_.MainWindowTitle} | Where-Object {$_ -match '^LHM_PROXY_TEST_[0-9]+'};exit 0`;
 const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{
  encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe'],env:{...process.env,LHM_SYNTHETIC_PID:String(rootPid),LHM_SYNTHETIC_ROOT:fixtureRoot,LHM_SYNTHETIC_PROFILE:profileId}});
 const matches=[...output.matchAll(/LHM_PROXY_TEST_(\d+)/g)].map(x=>Number(x[1]));
 if(!matches.length&&process.env.LHM_PROXY_TEST_DEBUG==='1')console.error('Synthetic browser window titles:',JSON.stringify(output.trim()));
 return matches.length?Math.max(...matches):null;
}
function answerSyntheticLanguageDialog(rootPid,fixtureRoot,profileId){
 if(!Number.isSafeInteger(rootPid)||rootPid<=0||!/^pb_[a-f0-9]+$/i.test(profileId))throw Error('Invalid synthetic browser identity');
 const command=String.raw`$ProgressPreference='SilentlyContinue';$rootPid=[int]$env:LHM_SYNTHETIC_PID
$root=Get-CimInstance Win32_Process -Filter ("ProcessId="+$rootPid)
if(-not $root -or $root.Name -ne 'firefox.exe' -or -not $root.CommandLine.Contains($env:LHM_SYNTHETIC_ROOT) -or -not $root.CommandLine.Contains($env:LHM_SYNTHETIC_PROFILE)){exit 3}
Add-Type -AssemblyName UIAutomationClient
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class LhmTestWindow { [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h,uint n); }'
$all=Get-CimInstance Win32_Process; $ids=@($rootPid)
do {$old=$ids.Count;$ids=@($ids)+@($all|Where-Object {$ids -contains $_.ParentProcessId}|ForEach-Object ProcessId)|Select-Object -Unique} while($ids.Count -gt $old)
$sawPopup=$false
foreach($p in @(Get-Process -Id $ids -ErrorAction SilentlyContinue)){
 $h=$p.MainWindowHandle;if($h -eq [IntPtr]::Zero){continue}
 $popup=[LhmTestWindow]::GetWindow($h,6);if($popup -eq [IntPtr]::Zero -or $popup -eq $h){continue}
 $element=[Windows.Automation.AutomationElement]::FromHandle($popup);if(-not $element){continue}
 $sawPopup=$true
 $children=$element.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
 $names=@($children|ForEach-Object {$_.Current.Name})
 if(-not ($names|Where-Object {$_ -match 'ngôn ngữ.*tiếng Anh'})){if($env:LHM_PROXY_TEST_DEBUG -eq '1'){Write-Output ('Unmatched synthetic popup: '+($names -join ' | '))};continue}
 $button=@($children|Where-Object {$_.Current.Name -eq 'Không' -and $_.Current.ControlType -eq [Windows.Automation.ControlType]::Button}|Select-Object -First 1)
 if($button.Count -ne 1){exit 4}
 $button[0].GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke();exit 0
}
exit 2`;
 const encoded=Buffer.from(command,'utf16le').toString('base64');
 try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{
  windowsHide:true,timeout:10000,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,LHM_SYNTHETIC_PID:String(rootPid),LHM_SYNTHETIC_ROOT:fixtureRoot,LHM_SYNTHETIC_PROFILE:profileId}});return 'answered'}
 catch(error){if(error.status===2){if(process.env.LHM_PROXY_TEST_DEBUG==='1'&&error.stdout)console.error(String(error.stdout).trim());return 'absent'}if(error.status===3)return 'root-gone';const detail=String(error.stderr||'').split(fixtureRoot).join('[synthetic]').slice(0,400);throw Error('Could not verify and answer the synthetic Firefox language dialog (status '+String(error.status??'unknown')+'): '+detail)}
}
async function runEngine(engine,browser){
 const fixtureBase=process.env.LHM_PROXY_TEST_ROOT||os.tmpdir();
 if(!path.isAbsolute(fixtureBase)||!fs.statSync(fixtureBase).isDirectory())throw Error('Synthetic fixture root must be an existing absolute directory');
 const root=fs.mkdtempSync(path.join(fixtureBase,'lhm-own-proxy-'));
 let direct=0,proxied=0,proxy,origin,launcher,profile,proc,proxyPort,handledDialog=false;
 const sockets=new Set();
 try{
  origin=http.createServer((req,res)=>{
   if(req.headers['x-lhm-lab-proxy']==='synthetic')proxied++;else direct++;
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');
   if(req.url.startsWith('/page'))res.end('<!doctype html><title>LHM_PROXY_TEST_0</title><script>let n=0;setInterval(()=>{document.title="LHM_PROXY_TEST_"+(++n);fetch("/ping?i="+n,{cache:"no-store"}).catch(()=>{})},500)</script>');
   else res.end('synthetic');
  });
  const originPort=await listen(origin);
  proxy=http.createServer((req,res)=>{
   let dest;try{dest=new URL(req.url)}catch(_){res.writeHead(400);res.end();return}
   if(dest.protocol!=='http:'||dest.hostname!=='127.0.0.1'||Number(dest.port)!==originPort){res.writeHead(403);res.end();return}
   const up=http.request({host:'127.0.0.1',port:originPort,path:dest.pathname+dest.search,method:req.method,
    headers:{...req.headers,host:'127.0.0.1:'+originPort,'x-lhm-lab-proxy':'synthetic'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
   up.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(up);
  });
  proxy.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});
  proxy.on('connect',(req,client,head)=>{
   client.on('error',()=>client.destroy());
   if(req.url!=='example.com:443'){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return}
   const upstream=net.connect({host:'example.com',port:443});sockets.add(upstream);
   upstream.on('close',()=>sockets.delete(upstream));upstream.on('error',()=>{if(!client.destroyed)client.destroy()});
   upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client)});
   client.once('close',()=>upstream.destroy());
  });
  proxyPort=await listen(proxy);
  const status=await networkCheck(proxyPort);assert(status>=200&&status<400);
  const store=new Store(root);profile=store.saveProfile({name:'Synthetic own-network proxy',engine,
   proxy:{type:'http',host:'127.0.0.1',port:proxyPort},fingerprint:{mode:'native'}});
  launcher=new BrowserLauncher(store);launcher.findBrowserBinary=()=>browser;
  await launcher.start(profile.id,'http://127.0.0.1:'+originPort+'/page');
  proc=launcher.activeProcesses.get(profile.id).process;
  const ready=Date.now()+30000;while(proxied<3&&Date.now()<ready)await sleep(100);
  assert(proxied>=3,'Synthetic page and requests did not traverse the proxy');
  assert.equal(direct,0,'Direct requests occurred before proxy disconnection');
  let before=null;const titleDeadline=Date.now()+30000;
  while(before===null&&Date.now()<titleDeadline){
   before=readAttemptCount(proc.pid,root,profile.id);
   if(before===null&&engine==='gecko'){
    const answer=answerSyntheticLanguageDialog(proc.pid,root,profile.id);
    if(answer==='root-gone')throw Error('Synthetic Firefox root exited before the request counter was verified');
    if(answer==='answered'){handledDialog=true;await sleep(500)}
   }
   if(before===null)await sleep(500);
  }
  assert(before!==null,'Could not observe synthetic browser request counter');
  for(const socket of sockets)socket.destroy();await close(proxy);proxy=null;
  const directBefore=direct,atDisconnect=readAttemptCount(proc.pid,root,profile.id);
  assert(atDisconnect!==null,'Could not observe browser counter after proxy shutdown');
  await sleep(8000);
  const after=readAttemptCount(proc.pid,root,profile.id);assert(after!==null&&after>atDisconnect,'Synthetic browser did not continue attempting requests after proxy loss');
  assert.equal(direct,directBefore,'Browser reached the origin directly after the proxy was disconnected');
  const done=new Promise(resolve=>proc.once('exit',resolve));assert.equal(launcher.stop(profile.id).success,true);
  const stopDeadline=Date.now()+20000;
  while(!proc.jobComplete&&Date.now()<stopDeadline){
   if(proc.dialogBlocked&&engine==='gecko'){
    if(!Number.isSafeInteger(proc.pid)){await sleep(300);continue}
    const answer=answerSyntheticLanguageDialog(proc.pid,root,profile.id);
    if(answer!=='answered'){await sleep(300);continue}
    handledDialog=true;
    const clearDeadline=Date.now()+5000;while(proc.dialogBlocked&&Date.now()<clearDeadline)await sleep(100);
    if(!proc.jobComplete){assert.equal(launcher.stop(profile.id).success,true,'Synthetic retry stop was rejected')}
   }
   await sleep(100);
  }
  const exitCode=await Promise.race([done,sleep(1000).then(()=>{throw Error('Synthetic browser did not close')})]);
  assert.equal(exitCode,0,'Synthetic browser did not close cleanly');
  const until=Date.now()+5000;while(launcher.isBusy(profile.id)&&Date.now()<until)await sleep(100);
  assert.equal(launcher.isBusy(profile.id),false);
  const report={result:'PASS',engine,ownNetworkTls:true,externalStatus:status,
   proxiedRequestsObserved:proxied,attemptsAfterDisconnect:after-atDisconnect,directRequestsAfterDisconnect:direct-directBefore,syntheticLanguageDialogHandled:handledDialog,closedCleanly:true};
  console.log(JSON.stringify(report));return report;
 }finally{
  if(launcher&&profile&&launcher.isBusy(profile.id)){
   const active=launcher.activeProcesses.get(profile.id)?.process;
   if(active&&!active.jobComplete){const done=new Promise(r=>active.once('exit',r));active.requestJobStop(true);await Promise.race([done,sleep(5000)])}
  }
  if(proxy){for(const socket of sockets)socket.destroy();await close(proxy)}
  if(origin)await close(origin);
  if(!launcher||!profile||!launcher.isBusy(profile.id))fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  else console.error('Synthetic fixture retained:',root);
 }
}
(async()=>{
 const results=[];
 for(const [engine,browser] of engines){
  if(process.argv[2]&&process.argv[2]!==engine)continue;
  if(!fs.existsSync(browser))throw Error('Browser missing: '+engine);
  const result=await runEngine(engine,browser);
  const command='(Get-Item -LiteralPath $env:LHM_SYNTHETIC_BROWSER).VersionInfo.ProductVersion';
  result.browserVersion=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{
   encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,LHM_SYNTHETIC_BROWSER:browser}}).trim();
  result.browserSha256=crypto.createHash('sha256').update(fs.readFileSync(browser)).digest('hex');results.push(result);
 }
 if(!results.length)throw Error('Unknown engine selection');
 if(process.env.LHM_PROXY_EVIDENCE_PATH){
  const file=process.env.LHM_PROXY_EVIDENCE_PATH;if(!path.isAbsolute(file))throw Error('Evidence path must be absolute');
  const codeFiles=['src/engine/browserLauncher.js','src/engine/launchArgs.js','src/engine/geckoProxy.js',
   'src/engine/proxyLaunchPreflight.js','src/engine/windowsJobSupervisor.ps1','tools/check-own-network-proxy.js'];
  const hashes=Object.fromEntries(codeFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex')]));
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:path.join(__dirname,'..'),encoding:'utf8',windowsHide:true}).trim();
  fs.writeFileSync(file,JSON.stringify({schema:'lhm.own-network-proxy.evidence.v1',generatedAt:new Date().toISOString(),
   commit,mode:'source',scope:'synthetic HTTP proxy; loopback HTTP traffic after proxy loss; external TLS to example.com',hashes,results},null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log('Sanitized evidence written');
 }
})().catch(error=>{console.error(error);process.exitCode=1});
