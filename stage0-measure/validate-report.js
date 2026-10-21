'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validateReport}=require('./report-gate');
const target=process.argv[2]||path.join(__dirname,'..','stage0-measure-results','stage0-local-report.json');
try{
 const stat=fs.statSync(target);
 if(stat.size>1024*1024)throw Error('Unexpectedly large report');
 const report=JSON.parse(fs.readFileSync(target,'utf8'));
 const verdict=validateReport(report);
 console.log(JSON.stringify({report:path.basename(target),...verdict}));
 if(!verdict.accepted)process.exitCode=2;
}catch(error){console.error('Report validation:',String(error.message||error));process.exitCode=2}
