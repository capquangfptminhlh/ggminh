'use strict';
const assert=require('node:assert/strict');
const {selectCandidateFiles}=require('../tools/font-candidate-filter');
const manifest={files:[{path:'camoufox.exe',bytes:5},{path:'fonts/ok.ttf',bytes:10},
 {path:'fonts/restricted.ttf',bytes:11},{path:'fonts/mixed.ttc',bytes:12},{path:'fonts/unknown.t1',bytes:13}]};
const report={files:[
 {file:'ok.ttf',bytes:10,bucket:'ship',faces:[{bucket:'ship',label:'OFL-1.1'}]},
 {file:'restricted.ttf',bytes:11,bucket:'drop',faces:[{bucket:'drop',label:'Microsoft'}]},
 {file:'mixed.ttc',bytes:12,bucket:'ship',faces:[{bucket:'ship',label:'OFL-1.1'},{bucket:'ship',label:'MIT'}]}],
 other_type1_fonts:[{file:'unknown.t1',bytes:13,bucket:'not-classified'}]};
assert.deepEqual(selectCandidateFiles(manifest,report).map(f=>f.path),['camoufox.exe','fonts/ok.ttf']);
assert.throws(()=>selectCandidateFiles(manifest,{...report,files:report.files.slice(1)}),/audit/i);
assert.throws(()=>selectCandidateFiles(manifest,{...report,files:[...report.files,report.files[0]]}),/duplicate/i);
assert.throws(()=>selectCandidateFiles(manifest,{...report,other_type1_fonts:[{file:'unknown.t1',bytes:14}]}),/audit/i);
console.log('Font candidate includes only completely audited allowed files: PASS');
