'use strict';
/**
 * Commercial release PRE-FLIGHT, not a publisher, signature system or
 * independent verification of human assertions.
 *
 * No tag, main merge, GitHub release, upload, key creation or network action
 * occurs here. FAIL-CLOSED until all constitution §12 stages have verifiable
 * evidence tied to the SAME commit and EXACT installer byte digest.
 *
 * This tool intentionally makes a preview with missing evidence NOT_READY.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const HEX64=/^[0-9a-f]{64}$/i;
const HEX40=/^[0-9a-f]{40}$/i;
const G3=Object.freeze([
  'G3-01','G3-02','G3-03','G3-04','G3-05','G3-05B',
  'G3-06','G3-07','G3-08','G3-09','G3-10a','G3-10b',
  'G3-11','G3-12'
]);
const DECISIONS=Object.freeze([
  'QD-01','QD-02','QD-03','QD-04','QD-05',
  'D1','D2','D3','D4','F3','F4','ECHO'
]);
const ROOT=path.resolve(__dirname,'..');
const DEFAULT_EVIDENCE='release/commercial-evidence-template.json';

function sha256(file){
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function gitHead(){
  const result=cp.spawnSync('git',['rev-parse','HEAD'],
    {cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:8000});
  return result.status===0 ? result.stdout.trim() : null;
}
function normalizedEvidencePath(given){
  const candidate=path.resolve(ROOT,given||DEFAULT_EVIDENCE);
  return candidate;
}
function parseEvidence(file){
  try{
    const loaded=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!loaded||typeof loaded!=='object'||Array.isArray(loaded))
      throw Error('Evidence root must be an object');
    return loaded;
  }catch(error){
    return {parseError:String(error.message||error)};
  }
}
function evaluate(e,env={}){
  const issues=[];
  const add=(gate,code,detail)=>{
    issues.push({gate,code,detail});
  };
  const sha=env.head||null,version=env.version||null;
  if(e?.parseError){add('SOURCE','EVIDENCE_UNREADABLE',e.parseError);return verdict();}
  if(e?.schema!==1)add('SOURCE','SCHEMA','Evidence schema must be 1');
  if(!HEX40.test(sha||''))add('SOURCE','GIT_HEAD_UNKNOWN','Exact Git HEAD is required');
  if(!HEX40.test(e?.source?.sha||'')||e.source.sha!==sha)
    add('SOURCE','COMMIT_MISMATCH','Evidence must name current 40-character Git SHA');
  if(e?.targetVersion!==version||version!=='5.8.0')
    add('SOURCE','VERSION','Evidence and package.json must match approved version 5.8.0');

  const one=e?.gate1;
  if(one?.status!=='PASS'||one.verifiedCommit!==sha||
      !Number.isInteger(one.testSteps)||one.testSteps<1||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(one.gitHubRun||''))
    add('GATE1','UNVERIFIED_TESTS','Full local/Windows test evidence on the SAME commit is required');

  const two=e?.gate2;
  if(two?.status!=='PASS'||!/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(two.windowsCiRun||''))
    add('GATE2','CI_NOT_CONFIRMED','Windows CI and Camoufox configured measurements must pass');
  const reports=[];
  for(const [key,classification] of [
    ['baselineReport','LOCAL_STAGE0_DIAGNOSTIC_ONLY'],
    ['configuredReport','LOCAL_STAGE0_CONFIGURED_PROFILE_DIAGNOSTIC_ONLY']
  ]){
    let item=null;
    try{
      if(typeof two?.[key]!=='string'||!two[key])throw Error('missing report path');
      const file=path.resolve(ROOT,two[key]);
      item=JSON.parse(fs.readFileSync(file,'utf8'));
      if(item.classification!==classification||item.branchHead!==sha||
         !HEX64.test(item.browserExecutableSha256||'')||
         item.cleanup!=='PASS'||item.checks?.status!=='PASS'||
         (key==='configuredReport'&&item.identity?.status!=='PASS'))
        throw Error('report does not prove full PASS on this exact Git commit');
    }catch(error){
      add('GATE2',key==='baselineReport'?'BASELINE_NOT_VERIFIED':'CONFIGURED_NOT_VERIFIED',
        String(error.message||error).slice(0,180));
    }
    reports.push(item);
  }
  if(reports.every(Boolean)&&(
      reports[0].browserExecutableSha256!==reports[1].browserExecutableSha256||
      reports[0].browserExecutableSha256!==two?.camoufoxEngineSha256))
    add('GATE2','ENGINE_MISMATCH','Both measurement reports must use the approved identical engine SHA-256');

  const build=e?.build;
  if(build?.status!=='PASS'||!HEX64.test(build.exeSha256||''))
    add('PACKAGE','NO_VERIFIED_INSTALLER','Approved release installer SHA-256 and PASS are required');
  else{
    try{
      if(typeof build.exePath!=='string'||!build.exePath.toLowerCase().endsWith('.exe'))
        throw Error('installer path missing or not an EXE');
      const file=path.resolve(ROOT,build.exePath);
      if(!fs.statSync(file).isFile())throw Error('installer not a file');
      if(sha256(file)!==build.exeSha256.toLowerCase())
        throw Error('installer SHA-256 does not match observed file bytes');
    }catch(error){add('PACKAGE','EXE_DIGEST_UNVERIFIED',String(error.message||error).slice(0,180));}
  }
  if(build?.installerLabel==='Preview')
    add('PACKAGE','PREVIEW_LABEL','A commercial release must not silently be marketed as a signed production build');
  if(!['SIGNED_VALID','OWNER_ACCEPTED_UNSIGNED'].includes(build?.authenticodeStatus))
    add('PACKAGE','AUTHENTICODE_POLICY','Authenticode signature or explicit owner acceptance of unsigned delivery required');

  const engine=e?.engine;
  if(engine?.distributionStatus!=='SIGNED_APPROVED'||
    !engine.enginePublisherVerified||!engine.licensedForDistribution||
    typeof engine.approvedOrigin!=='string'||!engine.approvedOrigin.trim()||
    typeof engine.fontsDecision!=='string'||!engine.fontsDecision.trim())
    add('ENGINE','ENGINE_DISTRIBUTION_PENDING','Official engine rights, publisher trust and approved font treatment are unverified');

  const three=e?.gate3;
  if(three?.status!=='PASS'||!/^Windows(?:\s|$)/.test(three?.machineWindowsVersion||'')||
    !three?.operator||!HEX64.test(three.testedExeSha256||'')||
    three.testedExeSha256!==build?.exeSha256)
    add('GATE3','INDEPENDENT_WINDOWS_ACCEPTANCE','Independent installed Windows acceptance must name EXACT installer hash');
  let evidenceRoot=null;
  try{
    if(!three?.evidenceDir||typeof three.evidenceDir!=='string')
      throw Error('Evidence directory is missing');
    const directory=path.resolve(ROOT,three.evidenceDir);
    if(!fs.statSync(directory).isDirectory())throw Error('Evidence path is not a directory');
    if(fs.lstatSync(directory).isSymbolicLink())
      throw Error('Symlinked evidence directory is not accepted');
    evidenceRoot=fs.realpathSync(directory);
  }catch(error){
    add('GATE3','EVIDENCE_DIRECTORY_MISSING',
      'Redacted evidence folder missing or invalid: '+String(error.message||error).slice(0,140));
  }
  for(const code of G3){
    const v=three?.checkpoints?.[code];
    if(v?.status!=='PASS'||typeof v.ref!=='string'||!v.ref.trim()||
       !HEX64.test(v.sha256||'')){
      add('GATE3','CHECKPOINT_'+code,
        'Acceptance checkpoint '+code+' requires PASS, an existing evidence file and SHA-256');
      continue;
    }
    try{
      if(!evidenceRoot)throw Error('Evidence directory not verified');
      const file=path.resolve(evidenceRoot,v.ref);
      const actualPath=fs.realpathSync(file);
      // Evidence must be a real file in the declared private acceptance
      // directory; reject traversal, reparse points and outside references.
      const relative=path.relative(evidenceRoot,actualPath);
      if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||
         path.isAbsolute(relative))
        throw Error('Evidence file escapes its acceptance directory');
      const stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.isSymbolicLink())
        throw Error('Evidence path is not a regular file');
      if(sha256(file)!==v.sha256.toLowerCase())
        throw Error('Evidence file SHA-256 does not match');
    }catch(error){
      add('GATE3','EVIDENCE_INTEGRITY_'+code,
        'Evidence for '+code+' could not be independently opened/hashed: '+
        String(error.message||error).slice(0,140));
    }
  }

  const decisions=e?.decisions;
  if(!decisions?.approvedBy||!decisions?.approvedAt)
    add('OWNER','DECISIONS_UNSIGNED','Owner must resolve documented production decisions');
  for(const code of DECISIONS){
    if(typeof decisions?.items?.[code]!=='string'||!decisions.items[code].trim())
      add('OWNER','DECISION_'+code,'Owner decision missing: '+code);
  }
  const four=e?.gate4;
  if(four?.status!=='APPROVED'||four.ownerApprovalForExactSha!==true||
     !four?.approvedBy||!four?.approvedAt)
    add('GATE4','FINAL_OWNER_APPROVAL','Final signoff must name exact commit after Gate 3');

  return verdict();
  function verdict(){
    return {
      classification:'STRUCTURAL_PRE_RELEASE_GATE_NOT_INDEPENDENT_ATTESTATION',
      status:issues.length?'NOT_READY':'READY_FOR_OWNER_FINAL_REVIEW',
      approvedToPublish:false, // NEVER publish automatically
      checkedHead:sha||'UNKNOWN',version:version||'UNKNOWN',
      blockers:issues,
      caveat:'Evidence fields may be user-authored; this script cannot independently validate a real Windows machine, legal distribution rights or signature ceremonies.'
    };
  }
}
function main(argv){
  const strict=argv.includes('--strict');
  const evidenceFlag=argv.indexOf('--evidence');
  if(evidenceFlag>=0&&(!argv[evidenceFlag+1]||argv[evidenceFlag+1].startsWith('--')))
    throw Error('Expected a file path after --evidence');
  const file=normalizedEvidencePath(evidenceFlag>=0?argv[evidenceFlag+1]:null);
  const e=parseEvidence(file);
  const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
  const report=evaluate(e,{head:gitHead(),version:pkg.version});
  console.log(JSON.stringify(report,null,2));
  if(strict&&report.status!=='READY_FOR_OWNER_FINAL_REVIEW')process.exitCode=2;
  return report;
}
if(require.main===module){
  try{main(process.argv.slice(2));}
  catch(error){console.error('[Commercial release preflight]',String(error.message||error));process.exitCode=2;}
}
module.exports={evaluate,main,parseEvidence,sha256,G3,DECISIONS};
