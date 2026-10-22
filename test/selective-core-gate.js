'use strict';
// Prevent excluded feature wiring and accidental regression in core-selective preview.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const files=['main.js','preload.js','src/ui/index.html','src/ui/maintenance.js','package.json','.github/workflows/windows-exe.yml'];
const forbidden=/cloud-sync|cloudSync|cloud-team|navigation-sync|NavigationSynchronizer|agency-approval|MaturationEngine|BehaviorEngine|sqliteMigrationPreview|preview-sqlite-migration|team-cloud-foundations|cloud-server\.js/i;
for(const file of files)assert.doesNotMatch(read(file),forbidden, 'Excluded wiring remains in '+file);
for(const file of ['src/sync/cloudClient.js','src/sync/cloudService.js','src/team/policy.js','src/ops/navigationSynchronizer.js','src/health/MaturationEngine.js','src/automation/BehaviorEngine.js','src/db/sqliteMigrationPreview.js'])assert.equal(fs.existsSync(path.join(root,file)),false,'Excluded module '+file);
for(const file of ['src/health/signalChain.js','src/health/localDrift.js','src/health/GraphDefense.js','src/engine/EngineFactory.js','src/engine/camoufoxAdapter.js','src/engine/CamoufoxPlaywrightController.js'])assert.equal(fs.existsSync(path.join(root,file)),true,'Missing core module '+file);
console.log('Selective core scope guard: PASS');
