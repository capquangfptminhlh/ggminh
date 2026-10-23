'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'index.html'), 'utf8');

assert.match(renderer, /window\.api\.getWarningReport\(\)/,
  'modal warning must consume the unified warning report');
for (const label of ['Quan sát:', 'Hồ sơ\/phiên:', 'Thời gian và phương pháp:',
  'Tiêu chí:', 'Giới hạn:', 'Bước kiểm tra tiếp:']) {
  assert.match(renderer, new RegExp(label), 'missing evidence label: ' + label);
}
assert.match(renderer, /status === 'error'/,
  'source errors must be rendered explicitly, not converted into normal');
assert.match(html, /Cảnh báo vận hành và bằng chứng/,
  'modal title must describe the unified, evidence-backed scope');
console.log('behavior-warning-ui: all assertions passed');

// Exécuter le vrai rendu avec un DOM minimal: texte non interprété et
// aucune confusion entre historique, source inconnue et alertes actives.
class Element {
  constructor() { this.children = []; this.textContent = ''; this.hidden = false; this.classList = { toggle() {} }; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
}
const nodes = new Map();
const document = { createElement: () => new Element(),
  createTextNode: value => ({ textContent: value }),
  getElementById: id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); } };
const legacy = { activities10m: 0, profileCount10m: 0, recentEvents: [] };
const warning = { id: 'example', level: 'medium', title: '<img src=x onerror=alert(1)>',
  observed: { summary: 'sample', profiles: ['p1'], sessionIds: ['s1'] },
  windowFromIso: '2026-10-22T01:00:00Z', windowToIso: '2026-10-22T01:01:00Z',
  method: 'test observation', criterion: 'local rule', limitation: 'test only', nextSteps: ['check'] };
let report = { overall: 'not_measured', warnings: [], history: [warning], sources: { ip: { status: 'not_measured', reason: 'missing' } } };
const sandbox = { document, window: { api: { getBehaviorReport: async () => legacy,
  getWarningReport: async () => report } }, behaviorAlertsSeen: new Set(), behaviorInitialized: false };
const start = renderer.indexOf('function behaviorDate(');
const end = renderer.indexOf('function setupEventListeners()', start);
vm.createContext(sandbox);
vm.runInContext(renderer.slice(start, end), sandbox);
(async () => {
  await sandbox.refreshBehaviorAlerts();
  assert.equal(nodes.get('behavior-alert-count').textContent, '0');
  assert.equal(nodes.get('behavior-level').textContent, 'Chưa đo đủ');
  assert.equal(nodes.get('behavior-warning-history').children.length, 1);
  report = { overall: 'medium', warnings: [warning], history: [], sources: {} };
  await sandbox.refreshBehaviorAlerts();
  const card = nodes.get('behavior-alert-list').children[0];
  assert.equal(card.children.length, 7);
  assert.equal(card.children[0].textContent, warning.title);
  assert.equal(nodes.get('behavior-alert-count').textContent, '1');
  sandbox.window.api.getWarningReport = async () => { throw Error('collection failed'); };
  await sandbox.refreshBehaviorAlerts();
  assert.equal(nodes.get('behavior-level').textContent, 'Cần kiểm tra');
  console.log('behavior-warning-ui: real render active/history/error cases passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
