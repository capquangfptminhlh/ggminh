# Preview License Issuer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable encrypted Preview license issuer, rotate the Preview trust anchor, issue and activate a 30-day Business license for the current installation, and prove that the existing Chromium profile launches past license enforcement.

**Architecture:** A small owner-only setup tool generates an encrypted Ed25519 PKCS#8 private key outside Git and returns only public anchor metadata. Windows DPAPI protects the randomly generated key passphrase for the current user. The desktop verifier, Worker verifier, and pinned trust-anchor test are rotated together; the existing issuer and `LicenseManager` then issue and activate the token without printing it.

**Tech Stack:** Node.js `crypto`, CommonJS, Windows PowerShell/DPAPI/ACLs, Electron Builder NSIS, Node `assert` tests.

---

## File map

- Create `tools/setup-preview-license-issuer.js`: owner-side encrypted Ed25519 key bootstrap; excluded from packaged builds by the existing `!tools/**` rule.
- Create `test/preview-license-issuer.js`: verifies encrypted-key generation, Ed25519 type, signing usability, wrong-passphrase failure, and overwrite refusal.
- Modify `package.json`: add the new test to `test:steps` before license trust-anchor checks.
- Modify `test/license-trust-anchor.js`: pin the generated Preview issuer SPKI SHA-256.
- Modify `src/licensing/manager.js`: replace the desktop license verification public key.
- Modify `serverless/license-worker/src/index.mjs`: replace the Worker client-issuer SPKI value.
- Create operational secrets only under `%LOCALAPPDATA%\LHM Ads Browser Publisher\preview-license-issuer`; never add them to Git.

### Task 1: Add the encrypted Preview issuer bootstrap

**Files:**
- Create: `test/preview-license-issuer.js`
- Create: `tools/setup-preview-license-issuer.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing bootstrap test**

Create `test/preview-license-issuer.js`:

```js
'use strict';
const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {setupPreviewIssuer}=require('../tools/setup-preview-license-issuer');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-preview-issuer-'));
const passphrase='preview-test-passphrase-32-bytes';
try{
 const result=setupPreviewIssuer(root,{passphrase});
 assert.strictEqual(crypto.createPublicKey(result.publicKey).asymmetricKeyType,'ed25519');
 assert.match(result.spkiBase64,/^[A-Za-z0-9+/=]+$/);
 assert.match(result.spkiSha256,/^[a-f0-9]{64}$/);
 const encrypted=fs.readFileSync(result.privateKeyFile,'utf8');
 assert.throws(()=>crypto.createPrivateKey(encrypted));
 assert.throws(()=>crypto.createPrivateKey({key:encrypted,format:'pem',passphrase:'wrong-passphrase'}));
 const privateKey=crypto.createPrivateKey({key:encrypted,format:'pem',passphrase});
 const message=Buffer.from('preview-license-issuer-test');
 const signature=crypto.sign(null,message,privateKey);
 assert(crypto.verify(null,message,result.publicKey,signature));
 assert.throws(()=>setupPreviewIssuer(root,{passphrase}),/already exists/);
 console.log('Preview issuer bootstrap: encrypted Ed25519 key, public metadata and overwrite refusal PASS');
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node test/preview-license-issuer.js
```

Expected: FAIL with `Cannot find module '../tools/setup-preview-license-issuer'`.

- [ ] **Step 3: Implement the minimal bootstrap tool**

Create `tools/setup-preview-license-issuer.js`:

```js
#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

function setupPreviewIssuer(outputDir,{passphrase=process.env.LHM_ISSUER_PASSPHRASE}={}){
 if(!path.isAbsolute(outputDir||''))throw Error('Absolute issuer directory required');
 if(typeof passphrase!=='string'||passphrase.length<24)
  throw Error('Preview issuer passphrase must contain at least 24 characters');
 fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
 const privateKeyFile=path.join(outputDir,'preview-license-ed25519-private.pem');
 const publicKeyFile=path.join(outputDir,'preview-license-ed25519-public.pem');
 if(fs.existsSync(privateKeyFile)||fs.existsSync(publicKeyFile))
  throw Error('Preview issuer already exists');
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 const privatePem=privateKey.export({
  format:'pem',type:'pkcs8',cipher:'aes-256-cbc',passphrase
 });
 const publicPem=publicKey.export({format:'pem',type:'spki'});
 fs.writeFileSync(privateKeyFile,privatePem,{flag:'wx',mode:0o600});
 try{fs.writeFileSync(publicKeyFile,publicPem,{flag:'wx',mode:0o644});}
 catch(error){fs.rmSync(privateKeyFile,{force:true});throw error;}
 const spki=publicKey.export({format:'der',type:'spki'});
 return {
  privateKeyFile,publicKeyFile,publicKey:publicPem.toString(),
  spkiBase64:spki.toString('base64'),
  spkiSha256:crypto.createHash('sha256').update(spki).digest('hex')
 };
}

if(require.main===module){
 try{
  const result=setupPreviewIssuer(process.argv[2]);
  console.log(JSON.stringify({
   publicKeyFile:result.publicKeyFile,publicKey:result.publicKey,
   spkiBase64:result.spkiBase64,spkiSha256:result.spkiSha256
  },null,2));
 }catch(error){
  console.error('Preview issuer setup:',error.message);
  process.exitCode=1;
 }
}

module.exports={setupPreviewIssuer};
```

- [ ] **Step 4: Add the test to the standard test chain**

In `package.json`, insert `node test/preview-license-issuer.js &&` immediately before `node test/license-trust-anchor.js` in `scripts.test:steps`.

- [ ] **Step 5: Run GREEN verification**

Run:

```powershell
node test/preview-license-issuer.js
node --check tools/setup-preview-license-issuer.js
```

Expected: the bootstrap test prints `PASS`; syntax check exits 0.

- [ ] **Step 6: Commit the bootstrap**

```powershell
git add -- tools/setup-preview-license-issuer.js test/preview-license-issuer.js package.json
git commit -m "feat(licensing): add encrypted Preview issuer bootstrap"
```

### Task 2: Generate and secure the reusable Preview issuer

**Files:**
- Create outside Git: `%LOCALAPPDATA%\LHM Ads Browser Publisher\preview-license-issuer\preview-license-ed25519-private.pem`
- Create outside Git: `%LOCALAPPDATA%\LHM Ads Browser Publisher\preview-license-issuer\preview-license-ed25519-public.pem`
- Create outside Git: `%LOCALAPPDATA%\LHM Ads Browser Publisher\preview-license-issuer\preview-license-passphrase.dpapi`
- Create outside Git: `%LOCALAPPDATA%\LHM Ads Browser Publisher\preview-license-issuer\preview-license-anchor.json`

- [ ] **Step 1: Generate a random passphrase, protect it with DPAPI, and generate the key**

Run from the repository root:

```powershell
$issuerDir = Join-Path $env:LOCALAPPDATA 'LHM Ads Browser Publisher\preview-license-issuer'
$random = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Fill($random)
$issuerPassphrase = [Convert]::ToBase64String($random)
$env:LHM_ISSUER_PASSPHRASE = $issuerPassphrase
$anchorJson = node tools/setup-preview-license-issuer.js $issuerDir | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Preview issuer generation failed' }
$secure = ConvertTo-SecureString $issuerPassphrase -AsPlainText -Force
$protected = ConvertFrom-SecureString $secure
[IO.File]::WriteAllText((Join-Path $issuerDir 'preview-license-passphrase.dpapi'),$protected)
[IO.File]::WriteAllText((Join-Path $issuerDir 'preview-license-anchor.json'),$anchorJson)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $issuerDir /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
Remove-Item Env:LHM_ISSUER_PASSPHRASE
$issuerPassphrase = $null
$secure = $null
$random = $null
```

Expected: command exits without displaying a private key, passphrase, or activation token.

- [ ] **Step 2: Verify paths, ACL, public-key type, and DPAPI recovery**

Run a verification script that prints only booleans and public fingerprints:

```powershell
$issuerDir = Join-Path $env:LOCALAPPDATA 'LHM Ads Browser Publisher\preview-license-issuer'
$secure = Get-Content -Raw (Join-Path $issuerDir 'preview-license-passphrase.dpapi') | ConvertTo-SecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:LHM_ISSUER_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
node -e "const fs=require('fs'),crypto=require('crypto'),path=require('path');const d=process.argv[1];const pem=fs.readFileSync(path.join(d,'preview-license-ed25519-private.pem'));const key=crypto.createPrivateKey({key:pem,format:'pem',passphrase:process.env.LHM_ISSUER_PASSPHRASE});const pub=crypto.createPublicKey(key);console.log(JSON.stringify({encryptedPrivateKeyReadable:key.asymmetricKeyType==='ed25519',publicKeyMatches:pub.export({format:'pem',type:'spki'}).toString()===fs.readFileSync(path.join(d,'preview-license-ed25519-public.pem'),'utf8')}));" $issuerDir
Remove-Item Env:LHM_ISSUER_PASSPHRASE
Get-Acl $issuerDir | Select-Object Owner,AccessToString | Format-List
Get-Content -Raw (Join-Path $issuerDir 'preview-license-anchor.json') | ConvertFrom-Json | Select-Object spkiSha256,spkiBase64 | Format-List
```

Expected: `encryptedPrivateKeyReadable` and `publicKeyMatches` are `true`; ACL contains only the current Windows identity; public fingerprint fields are present.

### Task 3: Rotate the Preview trust anchor with RED→GREEN proof

**Files:**
- Modify: `test/license-trust-anchor.js`
- Modify: `src/licensing/manager.js`
- Modify: `serverless/license-worker/src/index.mjs`

- [ ] **Step 1: Load the public anchor metadata**

```powershell
$issuerDir = Join-Path $env:LOCALAPPDATA 'LHM Ads Browser Publisher\preview-license-issuer'
$anchor = Get-Content -Raw (Join-Path $issuerDir 'preview-license-anchor.json') | ConvertFrom-Json
```

Use `$anchor.spkiSha256`, `$anchor.spkiBase64`, and `$anchor.publicKey`; none is secret.

- [ ] **Step 2: Change only the expected test pin**

In `test/license-trust-anchor.js`, replace the value assigned to `PINNED_SPKI_SHA256` with the exact value of `$anchor.spkiSha256`. Do not change the application or Worker key yet.

- [ ] **Step 3: Run the trust-anchor test and verify RED**

```powershell
node test/license-trust-anchor.js
```

Expected: FAIL at `license trust anchor changed` because the desktop application still contains the old public key.

- [ ] **Step 4: Rotate both public consumers**

In `src/licensing/manager.js`, replace `PUBLIC_KEY` with the exact PEM string from `$anchor.publicKey`, preserving `\n` escapes in the JavaScript string.

In `serverless/license-worker/src/index.mjs`, replace `CLIENT_ISSUER_SPKI_B64` with the exact value of `$anchor.spkiBase64`.

No private-key or passphrase material may appear in `git diff`.

- [ ] **Step 5: Run targeted GREEN verification**

```powershell
node test/license-trust-anchor.js
node test/license-center.js
node test/license-enforcement.js
node test/license-policy-integration.js
node test/license-state-matrix.js
node test/license-cloudflare-worker.js
node --check src/licensing/manager.js
node --check serverless/license-worker/src/index.mjs
```

Expected: every command exits 0; trust-anchor output confirms desktop/Worker equality and separation from the update key.

- [ ] **Step 6: Check the diff for secret leakage**

```powershell
git diff --check
git diff -- src/licensing/manager.js serverless/license-worker/src/index.mjs test/license-trust-anchor.js
git status --short
```

Expected: only public PEM/SPKI/fingerprint changes; no `PRIVATE KEY`, passphrase, or activation token.

- [ ] **Step 7: Commit the trust-anchor rotation**

```powershell
git add -- src/licensing/manager.js serverless/license-worker/src/index.mjs test/license-trust-anchor.js
git commit -m "chore(licensing): rotate Preview issuer trust anchor"
```

### Task 4: Build and install the rotated Preview application

**Files:**
- Build: `dist/LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`
- Install: `%LOCALAPPDATA%\Programs\LHM Ads Browser`

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm test
```

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Build the Windows installer**

```powershell
npm run build:win
```

Expected: exit 0 and the NSIS installer exists at `dist/LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe`.

- [ ] **Step 3: Close only installed LHM Ads Browser processes and install silently**

```powershell
$appExe = Join-Path $env:LOCALAPPDATA 'Programs\LHM Ads Browser\LHM Ads Browser.exe'
$targets = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $appExe }
$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
$installer = (Resolve-Path 'dist\LHM-Ads-Browser-5.8.0-Preview-Setup-x64.exe').Path
$install = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
```

Expected: installer exit code 0.

- [ ] **Step 4: Verify installed bytes match the build**

```powershell
$builtAsar = (Resolve-Path 'dist\win-unpacked\resources\app.asar').Path
$installedAsar = Join-Path $env:LOCALAPPDATA 'Programs\LHM Ads Browser\resources\app.asar'
$builtHash = (Get-FileHash $builtAsar -Algorithm SHA256).Hash
$installedHash = (Get-FileHash $installedAsar -Algorithm SHA256).Hash
if ($builtHash -ne $installedHash) { throw 'Installed app.asar does not match build output' }
[pscustomobject]@{AppAsarSha256=$installedHash;Match=$true} | Format-List
```

Expected: `Match : True`.

### Task 5: Issue and activate the 30-day license without exposing the token

**Files:**
- Read outside Git: encrypted Preview issuer files
- Modify application state: `%APPDATA%\power-browser\storage\license-activation.json`

- [ ] **Step 1: Confirm the installation identity before issuance**

```powershell
$storageDir = Join-Path $env:APPDATA 'power-browser\storage'
$identity = Get-Content -Raw (Join-Path $storageDir 'installation-id.json') | ConvertFrom-Json
if ($identity.installationId -ne '0ddbfcae-9c8b-4b00-b503-07a70b01c8aa') { throw 'Installation identity changed; stop issuance' }
```

Expected: command exits without error.

- [ ] **Step 2: Recover the passphrase into process memory and issue/activate in one Node process**

```powershell
$issuerDir = Join-Path $env:LOCALAPPDATA 'LHM Ads Browser Publisher\preview-license-issuer'
$storageDir = Join-Path $env:APPDATA 'power-browser\storage'
$secure = Get-Content -Raw (Join-Path $issuerDir 'preview-license-passphrase.dpapi') | ConvertTo-SecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:LHM_ISSUER_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$privateKey = Join-Path $issuerDir 'preview-license-ed25519-private.pem'
node -e "const {cli}=require('./tools/issue-license');const {LicenseManager}=require('./src/licensing/manager');const key=process.argv[1],storage=process.argv[2];const issued=cli(['--key',key,'--installation','0ddbfcae-9c8b-4b00-b503-07a70b01c8aa','--customer','LHM Preview Local','--plan','business','--days','30','--max-profiles','100','--enforcement','strict'],process.env);const manager=new LicenseManager(storage);const status=manager.activate(issued.token);console.log(JSON.stringify({status:status.status,plan:status.plan,expiresAt:status.expiresAt,maxProfiles:status.maxProfiles,features:status.features,installationId:status.installationId}));" $privateKey $storageDir
$issueExit = $LASTEXITCODE
Remove-Item Env:LHM_ISSUER_PASSPHRASE
if ($issueExit -ne 0) { throw 'License issue or activation failed' }
```

Expected: JSON contains `status:"active"`, `plan:"business"`, `maxProfiles:100`, the three expected features, and the current installation ID. The token is never printed.

- [ ] **Step 3: Verify activation from the installed application code**

Use the installed `app.asar` and the application UI to confirm:

- status is active;
- plan is Business;
- expiry is approximately 30 days after issuance;
- maximum profiles is 100;
- the generic expired-license IPC alert does not appear.

### Task 6: Prove the licensed profile launch and preserve evidence

**Files:**
- No repository changes expected

- [ ] **Step 1: Launch the installed application**

Open `%LOCALAPPDATA%\Programs\LHM Ads Browser\LHM Ads Browser.exe` and bind the single workspace window.

- [ ] **Step 2: Inspect License Center**

Open License Center and verify the active Business state, 30-day expiry, and 100-profile cap visibly.

- [ ] **Step 3: Open the existing Chromium profile**

Click `Mở` for `Profile_1`. Expected: no license dialog or `License expired`/trial-expired message; the profile transitions to running or reaches the next non-license launch guard.

- [ ] **Step 4: Run final repository verification**

```powershell
git status --short
git log -3 --oneline
```

Expected: clean worktree; the two new commits for issuer bootstrap and trust-anchor rotation are present after the design and plan commits.

- [ ] **Step 5: Report exact boundaries**

Report the license status, expiry, profile cap, installed ASAR hash, test count, and Chromium launch result. State explicitly that this license does not install or sign a Camoufox engine bundle.
