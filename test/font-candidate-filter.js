'use strict';
const assert=require('node:assert/strict');
const {selectCandidateFiles}=require('../tools/font-candidate-filter');
const manifest={files:[{path:'camoufox.exe',bytes:5},{path:'fonts/ok.ttf',bytes:10},
 {path:'fonts/restricted.ttf',bytes:11},{path:'fonts/mixed.ttc',bytes:12},{path:'fonts/unknown.t1',bytes:13},
 {path:'fonts/unclear.ttf',bytes:14}]};
const report={files:[
 {file:'ok.ttf',bytes:10,bucket:'ship',faces:[{index:0,bucket:'ship',label:'OFL-1.1'}]},
 {file:'restricted.ttf',bytes:11,bucket:'drop',faces:[{index:0,bucket:'drop',label:'Microsoft'}]},
 {file:'mixed.ttc',bytes:12,bucket:'ship',faces:[{index:0,bucket:'ship',label:'OFL-1.1'},{index:1,bucket:'ship',label:'MIT'}]},
 {file:'unclear.ttf',bytes:14,bucket:'ship',faces:[{index:0,bucket:'ship',label:'OFL-1.1'}]}],
 other_type1_fonts:[{file:'unknown.t1',bytes:13,bucket:'not-classified'}]};
const metadata={files:[{file:'ok.ttf',faces:[{index:0,bucket:'ship',label:'OFL-1.1',license:'license',license_url:'https://example.test/license'}]},
 {file:'mixed.ttc',faces:[{index:0,bucket:'ship',label:'OFL-1.1',license:'license',license_url:'https://example.test/license'},
 {index:1,bucket:'ship',label:'MIT',license:'license',license_url:'https://example.test/license'}]},
 {file:'unclear.ttf',faces:[{index:0,bucket:'ship',label:'OFL-1.1',license:'',license_url:'https://example.test/license'}]}]};
assert.deepEqual(selectCandidateFiles(manifest,report,metadata).map(f=>f.path),['camoufox.exe','fonts/ok.ttf']);
assert.throws(()=>selectCandidateFiles(manifest,{...report,files:report.files.slice(1)},metadata),/audit/i);
assert.throws(()=>selectCandidateFiles(manifest,{...report,files:[...report.files,report.files[0]]},metadata),/duplicate/i);
assert.throws(()=>selectCandidateFiles(manifest,{...report,other_type1_fonts:[{file:'unknown.t1',bytes:14}]},metadata),/audit/i);
assert.throws(()=>selectCandidateFiles(manifest,report,{files:metadata.files.slice(1)}),/metadata/i);
console.log('Font candidate includes only completely audited allowed files: PASS');
