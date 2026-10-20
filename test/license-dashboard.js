'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {addCustomer,issue}=require('../src/licensing/customerLedger');
const {generate,escape,htmlReport}=require('../tools/license-dashboard');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-report-v54-'));
try{
 const file=path.join(dir,'ledger.json'),out=path.join(dir,'operator-report.html');
 const now=Date.parse('2026-10-20T09:00:00.000Z');
 const c=addCustomer(file,'<img src=x onerror=alert(1)>',crypto.randomUUID(),{now:()=>now});
 const keys=crypto.generateKeyPairSync('ed25519');
 const publicKey=keys.publicKey.export({format:'pem',type:'spki'});
 const issued=issue(file,{customerId:c.id,plan:'pro',months:1,maxProfiles:100,
  privateKey:keys.privateKey,publicKey,now:()=>now});
 const response=generate(file,out,{now,days:40});
 assert(response.created);
 assert(fs.existsSync(out));
 const html=fs.readFileSync(out,'utf8');
 assert(html.includes('LHM Subscription Center'));
 assert(html.includes('BÁO CÁO RIÊNG TƯ'));
 assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
 assert(!html.includes('<img src=x onerror=alert(1)>'));
 assert(!html.includes(issued.token),'Activation tokens must not be in reports');
 assert(!html.includes('PRIVATE KEY'));
 assert(!html.includes('<script'));
 assert(html.includes('Content-Security-Policy'));
 assert(html.includes(issued.record.licenseId));
 assert(html.includes('License sắp hết hạn'));
 assert.throws(()=>generate(file,out,{now,days:40}),/EEXIST/,
  'Reports must never silently overwrite prior operator files');
 assert.strictEqual(escape("x&y<>\"'"),'x&amp;y&lt;&gt;&quot;&#39;');
 assert.throws(()=>htmlReport({customers:[],licenses:[]},{days:366}),/Invalid/);
 console.log('v5.4 offline dashboard HTML: XSS escaping, token exclusion, CSP and no-overwrite passed');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
