'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const asar=require('@electron/asar');
if(process.platform!=='win32'){console.log('SKIP Windows only');process.exit(0)}
(async()=>{
 const resources=path.resolve(process.argv[2]||'dist-supervisor-test/win-unpacked/resources');
 const archive=path.join(resources,'app.asar');
 const file=path.join(resources,'app.asar.unpacked','src','engine','windowsJobSupervisor.ps1');
 assert(fs.statSync(archive).isFile());assert(fs.statSync(file).isFile());
 assert(fs.statSync(path.join(resources,'app.asar.unpacked','src','engine','jobSupervisorBridge.js')).isFile());
 const entries=asar.listPackage(archive);
 assert(!entries.some(entry=>entry.toLowerCase().includes('.lhm-job-crash-')),'Synthetic crash fixtures must not be packaged');
 assert(!entries.some(entry=>entry.toLowerCase().includes('.last-supervisor-build')),'Local build paths must not be packaged');
 const source=asar.extractFile(archive,path.join('src','engine','jobSupervisor.js')).toString('utf8');
 const fakeFile=path.join(resources,'app.asar','src','engine','jobSupervisor.js');
 const loaded=new Module(fakeFile,module);loaded.filename=fakeFile;loaded.paths=Module._nodeModulePaths(path.dirname(fakeFile));
 process.resourcesPath=resources;loaded._compile(source,fakeFile);
 const proc=loaded.exports.spawnJobSupervisor(process.execPath,['-e','setTimeout(()=>{},300)']);
 await new Promise((resolve,reject)=>{proc.once('spawn',()=>{proc.resume();resolve()});proc.once('error',reject)});
 const code=await new Promise((resolve,reject)=>{proc.once('exit',resolve);proc.once('error',reject)});
 assert.equal(code,0);assert.equal(proc.jobComplete,true);
 console.log('Packaged ASAR module launches unpacked Windows supervisor PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
