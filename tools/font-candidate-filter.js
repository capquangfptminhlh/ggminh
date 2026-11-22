'use strict';
// Diagnostic subset only. Metadata labels are not proof of redistribution rights.
const APPROVED_LABELS=new Set(['OFL-1.1','Apache-2.0','Ubuntu-FL-1.0','CC0/PD']);
function selectCandidateFiles(manifest,report){
 if(!Array.isArray(manifest?.files)||!Array.isArray(report?.files)||!Array.isArray(report?.other_type1_fonts))throw Error('Invalid audit inputs');
 const audited=new Map();
 for(const row of [...report.files,...report.other_type1_fonts]){
  if(!row||typeof row.file!=='string'||row.file.includes('/')||row.file.includes('\\'))throw Error('Invalid audit filename');
  if(audited.has(row.file))throw Error('Duplicate audit filename');
  audited.set(row.file,row);
 }
 const candidates=[];let fontCount=0;
 for(const f of manifest.files){
  if(!f.path.startsWith('fonts/')){candidates.push(f);continue}
  const name=f.path.slice('fonts/'.length);
  if(name.includes('/')||!audited.has(name)||audited.get(name).bytes!==f.bytes)throw Error('Font audit differs from manifest');
  const row=audited.get(name);fontCount++;
  if(row.bucket==='ship'&&Array.isArray(row.faces)&&row.faces.length>0&&
    row.faces.every(face=>face.bucket==='ship'&&APPROVED_LABELS.has(face.label)))candidates.push(f);
 }
 if(fontCount!==audited.size)throw Error('Font audit differs from manifest');
 return candidates;
}
module.exports={selectCandidateFiles};
