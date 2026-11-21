'use strict';
// Packaged Camoufox gate: Camoufox runs in a packaged build only with the
// owner-pinned production publisher key; otherwise it is disabled and the
// Chromium path is untouched. All keys here are throwaway test keys.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {packagedCamoufoxTrust,spkiSha256,PRODUCTION_PUBLISHER_SPKI_SHA256}=
 require('../src/engine/camoufoxProductionTrust');

const key=crypto.generateKeyPairSync('ed25519').publicKey;
const other=crypto.generateKeyPairSync('ed25519').publicKey;
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).publicKey;
const pin=spkiSha256(key);

// Source/development runs keep their existing gates.
assert.deepEqual(packagedCamoufoxTrust({packaged:false,publisherKey:null}),{allowed:true,reason:null});
// Packaged branch: disabled without a key, without a pin, or with another key.
assert.match(packagedCamoufoxTrust({packaged:true,publisherKey:null,productionSpkiSha256:pin}).reason,
 /no publisher trust anchor/);
assert.match(packagedCamoufoxTrust({packaged:true,publisherKey:key}).reason,/not been pinned/);
assert.match(packagedCamoufoxTrust({packaged:true,publisherKey:key,productionSpkiSha256:'zz'}).reason,/not been pinned/);
assert.match(packagedCamoufoxTrust({packaged:true,publisherKey:other,productionSpkiSha256:pin}).reason,
 /not the pinned production key/);
assert.equal(packagedCamoufoxTrust({packaged:true,publisherKey:rsa,productionSpkiSha256:pin}).allowed,false);
// Packaged branch: enabled only with the pinned production key.
assert.deepEqual(packagedCamoufoxTrust({packaged:true,publisherKey:key,productionSpkiSha256:pin}),
 {allowed:true,reason:null});
assert.equal(packagedCamoufoxTrust({packaged:'yes',publisherKey:null}).allowed,true,
 'only a literal packaged=true selects the packaged branch (app.isPackaged is boolean)');

// Nothing is pinned until the owner's production key ceremony, and the RC1
// rehearsal key shipped in resources/camoufox-engine must never be pinned.
const rcKey=crypto.createPublicKey(fs.readFileSync(
 path.join(__dirname,'..','resources','camoufox-engine','publisher-ed25519.pub')));
assert.equal(PRODUCTION_PUBLISHER_SPKI_SHA256,null,'production pin must come from the owner ceremony');
assert.notEqual(PRODUCTION_PUBLISHER_SPKI_SHA256,spkiSha256(rcKey));
assert.equal(packagedCamoufoxTrust({packaged:true,publisherKey:rcKey}).allowed,false,
 'a packaged build with the RC1 rehearsal key keeps Camoufox disabled');

// Wiring: the gate runs after the key is loaded and before any Camoufox
// install/launch object is built; a denial clears the key. Chromium's bundled
// engine manager is built earlier and never reads the Camoufox key.
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const load=main.indexOf('publisherKey=loadCamoufoxPublisherKey(');
const gate=main.indexOf('packagedCamoufoxTrust({packaged:app.isPackaged,publisherKey})');
const install=main.indexOf('camoufoxInstall=new CamoufoxInstallService(');
assert(load>0&&gate>load&&install>gate,'packaged gate must sit between key load and Camoufox install');
assert(/if\(!productionTrust\.allowed\)\{[^}]*publisherKey=null;/.test(main),'denial must clear the Camoufox key');
const chromium=main.indexOf('bundledEngine=new BundledEngineManager(app.isPackaged');
assert(chromium>0&&chromium<load,'Chromium bundled engine must be set up independently, before Camoufox trust');
const chromiumBlock=main.slice(chromium,main.indexOf('launcher.bundledEngine=bundledEngine;',chromium));
assert(!/publisherKey|camoufox/i.test(chromiumBlock),'Chromium engine setup must not depend on Camoufox trust');

console.log('Packaged Camoufox production gate: disabled without pinned production key, Chromium independent: PASS');
