'use strict';
// A future "feature parity" integration may only be additive: removing an
// LHM-native module, bridge or UI entry is a CI failure until explicitly
// reviewed. This is a wiring smoke test, not a guarantee of runtime behaviour.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const base = path.resolve(__dirname, '..');
const safe = rel => {
  assert(typeof rel === 'string' && /^[A-Za-z0-9._/-]+$/.test(rel) &&
         !rel.split('/').includes('..') && !path.isAbsolute(rel),
    'Unsafe LHM feature manifest path');
  return path.join(base, rel);
};
const manifest = JSON.parse(fs.readFileSync(safe('docs/lhm-preserved-features.json'), 'utf8'));
assert.strictEqual(manifest.schemaVersion, 1);
assert(Array.isArray(manifest.features) && manifest.features.length >= 12);
const ids = new Set();
for (const feature of manifest.features) {
  assert(typeof feature.id === 'string' && feature.id.startsWith('lhm-'));
  assert(!ids.has(feature.id), 'Duplicate feature ID: ' + feature.id);
  ids.add(feature.id);
  assert(typeof feature.label === 'string' && feature.label.length > 10);
  assert(Array.isArray(feature.files) && feature.files.length);
  for (const rel of feature.files)
    assert(fs.statSync(safe(rel)).isFile(), 'Missing LHM feature module: ' + rel);
  assert(Array.isArray(feature.anchors) && feature.anchors.length);
  for (const [rel, marker] of feature.anchors) {
    assert(typeof marker === 'string' && marker.length >= 4);
    const source = fs.readFileSync(safe(rel), 'utf8');
    assert(source.includes(marker), feature.id + ': feature wiring missing from ' + rel + ': ' + marker);
  }
}
for (const id of [
 'lhm-multi-engine','lhm-native-inspector','lhm-signal-chain',
 'lhm-graph-defense','lhm-local-ip','lhm-proxy-vault','lhm-session-snapshots',
 'lhm-control-tower','lhm-rpa-approval','lhm-ai-advisor','lhm-license',
 'lhm-api-auth','lhm-import-metadata','lhm-rpa-templates','lhm-ai-budget'
]) assert(ids.has(id), 'Preserved feature manifest lost critical LHM feature: ' + id);

const pkg = JSON.parse(fs.readFileSync(safe('package.json'), 'utf8'));
const chain = pkg.scripts['test:steps'];
for (const test of [
 'test/ai-advisor.js','test/ai-usage-budget.js','test/adspower-json-import.js',
 'test/rpa-templates.js','test/proxy-vault.js','test/signal-chain.js',
 'test/license-enforcement.js','test/session-snapshots.js',
 'test/lhm-feature-preservation.js'
]) assert(chain.includes('node ' + test), 'Full Windows CI no longer runs ' + test);

const parity = JSON.parse(fs.readFileSync(safe('docs/feature-parity.json'), 'utf8'));
assert(Array.isArray(parity) && parity.length >= 12);
assert(parity.some(x => x.id === 'commercial') &&
       parity.some(x => x.id === 'ai-agent') &&
       parity.some(x => x.id === 'cloud-sync'),
 'Do not silently remove commercial/AI/cloud readiness blockers');
console.log('LHM preservation contract: '+ids.size+' native/additive features and essential CI checks preserved');
