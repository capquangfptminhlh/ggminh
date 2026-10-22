'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createUpdatePublisher,parse:parseSetup}=require('../tools/setup-update-publisher');
const {preflight,parseArgs:dossierArgs}=require('../tools/update-release-preflight');
const {signAppUpdate}=require('../tools/sign-app-update');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-release-root-'));
const privateDir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-release-offline-secret-'));
const passphrase='synthetic-local-test-only-passphrase-2026';
const privateFile=path.join(privateDir,'encrypted-update-private.pem');
const publicDir=path.join(root,'resources','update-publisher');
const publicFile=path.join(publicDir,'update-publisher-ed25519.pub');
fs.mkdirSync(publicDir,{recursive:true});
try {
 assert.deepEqual(parseSetup(['--private',privateFile,'--public',publicFile]),
  {privateFile,publicFile});
 assert.throws(()=>parseSetup(['--invalid','abc']),/Usage/);
 assert.throws(()=>createUpdatePublisher({
  privateFile,publicFile,passphrase:'too-short',repoRoot:root
 }),/>=16/);
 assert(!fs.existsSync(privateFile));
 assert.throws(()=>createUpdatePublisher({
  privateFile:path.join(root,'private.pem'),publicFile,passphrase,repoRoot:root
 }),/PRIVATE key inside/);
 assert.throws(()=>createUpdatePublisher({
  privateFile,publicFile:path.join(privateDir,'public.pub'),passphrase,repoRoot:root
 }),/inside controlled repository/);

 const result=createUpdatePublisher({privateFile,publicFile,passphrase,repoRoot:root});
 assert.equal(result.created,true);
 assert.equal(result.publicKeySpkiSha256.length,64);
 assert(fs.existsSync(privateFile)&&fs.existsSync(publicFile));
 assert(!fs.readFileSync(privateFile,'utf8').includes('BEGIN PRIVATE KEY'));
 assert(fs.readFileSync(privateFile,'utf8').includes('ENCRYPTED PRIVATE KEY'));
 assert.equal(crypto.createPublicKey({
  key:crypto.createPrivateKey({key:fs.readFileSync(privateFile),passphrase})
 }).export({format:'der',type:'spki'}).toString('hex'),
 crypto.createPublicKey(fs.readFileSync(publicFile)).export({format:'der',type:'spki'}).toString('hex'));
 assert.throws(()=>createUpdatePublisher({privateFile,publicFile,passphrase,repoRoot:root}),/already exists/);

 const version='5.9.0', fileName='LHM-Ads-Browser-5.9.0-Preview-Setup-x64.exe';
 const installer=path.join(privateDir,fileName);
 fs.writeFileSync(installer,Buffer.from('synthetic release candidate test bytes'.repeat(15)));
 const url='https://github.com/capquangfptminhlh/ggminh/releases/download/v'+version+'/'+fileName;
 const manifest=path.join(privateDir,'stable.json');
 const signer=signAppUpdate({
  artifactPath:installer,version,url,out:manifest,keyFile:privateFile,
  passphrase,publisherKeyFile:publicFile,channel:'stable',now:Date.parse('2026-10-23T00:00:00.000Z'),
  repoRoot:root
 });
 assert.equal(signer.selfCheck,'update-available');
 assert.deepEqual(dossierArgs(['--installer',installer,'--manifest',manifest,'--public-key',publicFile,'--version',version]),{
  '--installer':installer,'--manifest':manifest,'--public-key':publicFile,'--version':version
 });
 const opts={installer,manifest,publicKey:publicFile,version,now:Date.parse('2026-10-23T01:00:00.000Z')};
 const report=preflight(opts);
 assert.equal(report.verdict,'VERIFIED_ARTIFACT_ONLY');
 assert.equal(report.sha256,signer.sha256);
 assert.equal(report.bytes,signer.bytes);
 assert.equal(report.publisherSpkiSha256,result.publicKeySpkiSha256);
 const reportPath=path.join(privateDir,'preflight.json');
 assert.equal(preflight({...opts,report:reportPath}).verdict,'VERIFIED_ARTIFACT_ONLY');
 assert(fs.existsSync(reportPath));
 assert.throws(()=>preflight({...opts,report:reportPath}),/EEXIST/);
 assert.throws(()=>preflight({...opts,version:'5.10.0'}),/version mismatch/i);
 assert.throws(()=>preflight({...opts,fromVersion:'6.0.0'}),/rejected/);
 assert.throws(()=>preflight({...opts,now:Date.parse('2027-01-01T00:00:00.000Z')}),/rejected/);

 fs.appendFileSync(installer,'changed-by-attack');
 assert.throws(()=>preflight(opts),/size\/SHA-256/);
 fs.writeFileSync(installer,Buffer.from('synthetic release candidate test bytes'.repeat(15)));
 const tampered=JSON.parse(fs.readFileSync(manifest,'utf8'));
 tampered.artifact.sha256='a'.repeat(64);
 const badManifest=path.join(privateDir,'tampered.json');
 fs.writeFileSync(badManifest,JSON.stringify(tampered));
 assert.throws(()=>preflight({...opts,manifest:badManifest}),/rejected/);
 const evil=JSON.parse(fs.readFileSync(manifest,'utf8'));
 evil.artifact.url='https://evil.example/other.exe';
 const evilManifest=path.join(privateDir,'evil.json');
 fs.writeFileSync(evilManifest,JSON.stringify(evil));
 assert.throws(()=>preflight({...opts,manifest:evilManifest}),/rejected/);
 const rootDir=path.resolve(__dirname,'..');
 const work=fs.readFileSync(path.join(rootDir,'.github/workflows/prepare-draft-release.yml'),'utf8');
 const pkg=JSON.parse(fs.readFileSync(path.join(rootDir,'package.json'),'utf8'));
 assert(work.includes('workflow_dispatch:'),'Draft release cannot automatically run');
 assert(work.includes('--draft'),'Draft release must never auto-publish');
 assert(work.includes('run_conclusion')&&work.includes('run_sha')&&work.includes('run_workflow'));
 assert(work.includes('SHA256SUMS.txt'));
 assert(work.includes('${{ github.token }}'));
 assert(!work.includes('\\${{'),'GitHub expressions must not be escaped');
 assert(!work.includes('LHM_UPDATE_SIGNING_KEY_FILE'),'CI must never load offline private key');
 assert(pkg.scripts['test:steps'].includes('node test/online-release-operator.js'));
 assert(fs.readFileSync(path.join(rootDir,'docs/LHM_SIGNED_ONLINE_UPDATES.md'),'utf8')
  .includes('tools/setup-update-publisher.js'));
 console.log('LHM release operator: encrypted offline keys, zero-overwrite, signed EXE preflight, tamper rejection, draft-only provenance PASS');
} finally {
 fs.rmSync(root,{recursive:true,force:true});
 fs.rmSync(privateDir,{recursive:true,force:true});
}
