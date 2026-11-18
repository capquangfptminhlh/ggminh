'use strict';
// Detached bridge keeps the Windows job supervisor alive if the app exits.
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const script=process.argv[2];
if(!script)process.exit(2);
const helper=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{
 windowsHide:true,stdio:['pipe','pipe','pipe']
});
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
helper.stdin.on('error',()=>{});process.stdin.on('error',()=>{});
process.stdin.pipe(helper.stdin);
let phase='before-create';
function send(value){if(!process.stdout.destroyed)process.stdout.write(value+'\n')}
readline.createInterface({input:helper.stdout,crlfDelay:Infinity}).on('line',line=>{
 try{
  const message=JSON.parse(line);
  if(message.event==='creating')phase='creating';
  else if(message.event==='aborted')phase='aborted';
  else if(phase==='before-create')phase='unknown';
 }catch(_){phase='unknown'}
 send(line);
});
helper.stderr.on('data',chunk=>{if(!process.stderr.destroyed)process.stderr.write(chunk)});
helper.on('error',()=>{if(phase==='before-create'){send('{"event":"aborted"}');phase='aborted'}process.stdin.unpipe(helper.stdin);process.stdin.destroy();process.exitCode=1});
helper.on('close',(code,signal)=>{
 if(phase==='before-create'&&(signal||code!==0))send('{"event":"aborted"}');
 process.stdin.unpipe(helper.stdin);process.stdin.destroy();process.exitCode=signal?1:(code===0?0:1);
});
