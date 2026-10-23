'use strict';

// Prevent a customer-facing quickstart from regressing to unauthenticated
// localhost calls, simulated CDP endpoints, or claims that CI approves sales.
// This is a docs/contract regression check, not a live Windows or network test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readme = read('README.md');
const guide = read('docs/customer-guide/08-local-api-an-toan.md');
const guideIndex = read('docs/customer-guide/README.md');
const api = read('src/api/server.js');
const packageVersion = JSON.parse(read('package.json')).version;

const first = readme.indexOf('## 🤖 Local API an toàn');
const end = readme.indexOf('## Bản cài đặt Windows', first);
assert(first !== -1 && end > first, 'Quickstart must be in the primary README');
const quickstart = readme.slice(first, end);
const firstHistory = readme.indexOf('## Cảnh báo hành vi');
assert(firstHistory > end, 'Historical notes must follow the current quickstart');
const currentDocs = readme.slice(0, firstHistory);

for (const [label, doc] of [['README', quickstart], ['customer guide', guide]]) {
  assert.match(doc, /LHM_API_KEY/, label + ' must use an external env secret');
  assert.match(doc, /X-API-Key/, label + ' must send API authentication');
  assert.match(doc, /requests\.get\(/, label + ' must show a Python request');
  assert.match(doc, /raise_for_status\(\)/, label + ' must check HTTP failures');
  assert.match(doc, /payload\.get\("code"\) != 0/, label + ' must check API failure codes');
  assert.match(doc, /connect_over_cdp\(ws/, label + ' must use returned CDP value');
  assert.match(doc, /Camoufox/, label + ' must distinguish non-CDP engines');
  assert.doesNotMatch(doc, /requests\.get\(API_URL\)\.json\(\)/,
    label + ' must not retain unauthenticated legacy example');
}

assert.match(api, /req\.get\('x-api-key'\)/, 'Real Local API requires header');
assert.match(api, /timingSafeEqual/, 'Real Local API has constant-time key verification');
assert.match(currentDocs, /Proxy Center.*HTTP.*SOCKS5/s, 'Current proxy description must be accurate');
assert.doesNotMatch(currentDocs, /Proxy có username\/password \*\*chưa hỗ trợ\*\*/,
  'Historical proxy limitation must not appear in current guide');
assert.match(currentDocs, /Gate 3/, 'Windows acceptance cannot be inferred from CI');
assert.match(currentDocs, /Gate 4/, 'Owner signoff cannot be inferred from CI');
assert.match(guideIndex, /08-local-api-an-toan\.md/, 'Customer index must link API guide');
assert.match(guide, /401/);
assert.match(guide, /403/);
assert.match(guide, /409/);
assert.match(readme, new RegExp('aligned at v' + packageVersion.replace(/\./g, '\\.')),
  'README runtime version note must match package.json');

console.log('PASS authenticated Local API quickstart, current feature claims, customer guide and release warnings');
