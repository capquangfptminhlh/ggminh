'use strict';
// Rebuilt Profile Health and Android Device Center layout contract (static).
// Real-app check (owner's window 1218x790, isolated store, 6 profiles, 2 with
// real config errors): 27/27. Health: first profile result was at y=1405 of a
// 3161 px body (visible 621), now y=141 with no body scroll. Android: device
// lists were at y=757 and the device selector at y=944, now 341 and 111.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const read = f => fs.readFileSync(path.join(ui, f), 'utf8');
const html = read('index.html');
const slice = (id, next) => { const s = html.indexOf('<div class="modal-overlay" id="' + id + '">'); assert(s >= 0, id); return html.slice(s, html.indexOf(next, s + 10)); };

// ---- Profile Health
const health = slice('modal-health', '<div class="modal-overlay" id="modal-backup">');
const hAt = n => { const i = health.indexOf(n); assert(i >= 0, 'health missing ' + n); return i; };
const header = health.slice(hAt('<div class="modal-header">'), hAt('<div class="modal-body'));
for (const id of ['health-total', 'health-errors', 'health-warnings']) assert(header.includes('id="' + id + '"'), id + ' in header');
const hTabs = ['profiles', 'criteria', 'system', 'network', 'drift'];
for (const t of hTabs) { assert(health.includes('data-tab="health-tab-' + t + '"')); assert(health.includes('id="health-tab-' + t + '"')); }
// Per-profile results are the first tab; the other checks live in later tabs.
assert(hAt('id="health-tab-profiles"') < hAt('id="health-items"') && hAt('id="health-items"') < hAt('id="health-tab-criteria"'));
assert(hAt('id="health-tab-criteria"') < hAt('id="criteria-checklist"') && hAt('id="criteria-checklist"') < hAt('id="health-tab-system"'));
assert(hAt('id="health-tab-system"') < hAt('id="health-readiness-refresh"') && hAt('id="health-isolation-audit"') < hAt('id="health-tab-network"'));
assert(hAt('id="health-tab-network"') < hAt('id="agency-network-check"') && hAt('id="agency-network-check"') < hAt('id="health-tab-drift"'));
assert(hAt('id="health-tab-drift"') < hAt('id="local-drift-record"'));
// The sample/live toggle sits above the long criteria list.
assert(hAt('id="criteria-checklist-sample"') < hAt('id="criteria-checklist"'));
assert(read('maintenance.js').includes("document.querySelector('#modal-health .health-tabs .tab-btn')?.click();"));

// ---- Android Device Center
const android = slice('modal-android-manager', '</body>');
const aAt = n => { const i = android.indexOf(n); assert(i >= 0, 'android missing ' + n); return i; };
const aTabs = ['devices', 'create', 'control', 'inspector', 'agent', 'setup'];
for (const t of aTabs) { assert(android.includes('data-tab="android-tab-' + t + '"')); assert(android.includes('id="android-tab-' + t + '"')); }
// Device selector, runtime status and feedback are above the tabs (shared by every tab).
for (const id of ['android-control-serial', 'android-sdk-status', 'android-refresh', 'android-feedback']) assert(aAt('id="' + id + '"') < aAt('class="tabs lhm-steps lhm-android-tabs"'), id + ' above tabs');
assert(aAt('id="android-tab-devices"') < aAt('id="android-avd-list"') && aAt('id="android-device-list"') < aAt('id="android-tab-create"'));
assert(aAt('id="android-tab-create"') < aAt('id="android-create-form"') && aAt('id="android-duplicate-form"') < aAt('id="android-tab-control"'));
assert(aAt('id="android-tab-control"') < aAt('id="android-control-capture"') && aAt('id="android-control-send-text"') < aAt('id="android-tab-inspector"'));
assert(aAt('id="android-tab-agent"') < aAt('id="android-agent-propose"'));
assert(!/LOCAL ADB|REVIEW EACH STEP/.test(android), 'English all-caps tags');
// Code that used to scroll to a panel now opens its tab first.
assert(read('androidControlStudio.js').includes('data-tab="android-tab-control"'));
assert(read('androidAgentStudio.js').includes('data-tab="android-tab-agent"'));
assert(read('androidManager.js').includes('data-tab="android-tab-devices"'));
const css = read('androidManager.css') + read('workspace.css');
assert(/#modal-health \.health-pane\{[^}]*overflow-y:auto/.test(css));
assert(/#modal-android-manager \.lhm-android-pane \{[^}]*overflow-y: auto/.test(css));
console.log('Rebuilt Health and Android: results/devices first, sections as tabs, shared device selector passed');
