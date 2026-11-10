'use strict';
// Customers saw "Error invoking remote method 'license-center-activate': Error:
// License format not recognized" (found while rehearsing the first-sale
// acceptance script on the installed a1f8d02 build). The preload now strips
// Electron's IPC prefix for every API call, and the License screen explains
// each activation error in Vietnamese.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('node:module');
const root = path.join(__dirname, '..');

(async () => {
  // 1. Preload: every API promise rejects with the main-process message only.
  const originalLoad = Module._load;
  let exposed = null;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return {
      contextBridge: { exposeInMainWorld: (name, api) => { exposed = { name, api }; } },
      ipcRenderer: {
        invoke: ch => ch === 'get-settings' ? Promise.resolve({ ok: 1 })
          : ch === 'save-profile' ? Promise.reject(new Error("Error invoking remote method 'save-profile': Error: Giới hạn 10 profile của gói dùng thử đã đạt."))
          : ch === 'license-center-activate' ? Promise.reject(Object.assign(new Error("Error invoking remote method 'license-center-activate': TypeError: License format not recognized"), { code: 'E_LIC' }))
          : Promise.reject(new Error('plain failure')),
        on() {}, removeListener() {}
      }
    };
    return originalLoad.call(this, request, ...rest);
  };
  try { delete require.cache[require.resolve('../preload.js')]; require('../preload.js'); }
  finally { Module._load = originalLoad; }
  assert.strictEqual(exposed.name, 'api');
  const api = exposed.api;
  assert.deepStrictEqual(await api.getSettings(), { ok: 1 }, 'successful calls are untouched');
  await assert.rejects(api.saveProfile({}), e => e.message === 'Giới hạn 10 profile của gói dùng thử đã đạt.');
  await assert.rejects(api.activateLicense('x'), e => e.message === 'License format not recognized' && e.code === 'E_LIC');
  await assert.rejects(api.getProfiles(), e => e.message === 'plain failure', 'messages without the prefix pass through');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  assert.strictEqual((preload.match(/exposeInMainWorld\(/g) || []).length, 1);

  // 2. License screen: every English activation error thrown by manager.js has a Vietnamese explanation.
  const ui = fs.readFileSync(path.join(root, 'src/ui/licenseCenter.js'), 'utf8');
  const start = ui.indexOf('const activationHelp=[');
  const end = ui.indexOf('];', start) + 1;
  assert(start > 0 && end > start, 'activationHelp table missing');
  const table = vm.runInNewContext(ui.slice(start + 'const activationHelp='.length, end));
  const explain = m => (table.find(([p]) => p.test(m)) || [null, null])[1];
  const manager = fs.readFileSync(path.join(root, 'src/licensing/manager.js'), 'utf8');
  const thrown = [...manager.matchAll(/throw Error\('([^']+)'\)/g)].map(m => m[1]);
  assert(thrown.length >= 10, 'expected the manager.js activation errors');
  for (const message of thrown) {
    const text = explain(message);
    assert(text && !/[A-Za-z]{4,} [a-z]+ (?:not|is|invalid)/.test(text), 'no Vietnamese explanation for: ' + message);
  }
  assert(ui.includes("msg.textContent='Kích hoạt thất bại: '+explainActivation(error.message);"));
  console.log('IPC error messages: preload strips the Electron prefix; ' + thrown.length + ' license errors explained in Vietnamese');
})().catch(e => { console.error(e); process.exit(1); });
