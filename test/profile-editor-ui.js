'use strict';
// Rebuilt profile editor (create/edit dialog) contract, static.
// Real-app check (owner's window 1220x791, isolated store): create -> edit ->
// save round trip, Firefox path / proxy fields toggle, reopen starts on tab 1
// with the name focused; 11/11.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(ui, 'renderer.js'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'system.css'), 'utf8');

const start = html.indexOf('<div class="modal-overlay" id="modal-profile">');
const dialog = html.slice(start, html.indexOf('<!-- Modal: RPA Automation Code Guide -->', start));
const section = id => dialog.slice(dialog.indexOf('id="' + id + '"'), dialog.indexOf('<!-- Tab', dialog.indexOf('id="' + id + '"') + 1));
const general = section('tab-general'), proxy = section('tab-proxy');

// The name comes first: it was below the engine picker and a long paragraph.
const firstField = general.match(/<(?:input|select|textarea)(?![^>]*type="hidden")[^>]*id="([^"]+)"/);
assert.strictEqual(firstField && firstField[1], 'field-name', 'Tên hồ sơ must be the first field');
assert(/for="field-name">Tên hồ sơ <span class="lhm-required"/.test(general));
// Every field in tabs 1-2 has a label bound to it (click label -> focus field).
for (const part of [general, proxy])
  for (const [, id] of part.matchAll(/<(?:input|select|textarea)(?![^>]*type="hidden")[^>]*id="([^"]+)"/g))
    assert(part.includes('for="' + id + '"'), 'label missing for #' + id);
// No dark-theme inline colours left in the rebuilt tabs.
for (const part of [general, proxy]) assert(!/style="[^"]*color:/.test(part), 'inline colour in profile dialog');
// Long Camoufox guidance stays available, folded under "Chi tiết".
assert(/<details class="lhm-field-more">[\s\S]*Camoufox[\s\S]*<\/details>/.test(general));
// Numbered step tabs; the capture gate still clicks data-tab=tab-fingerprint.
for (const t of ['tab-general', 'tab-proxy', 'tab-fingerprint']) assert(dialog.includes('data-tab="' + t + '"'));
assert(dialog.includes('class="tabs lhm-steps"') && css.includes('.tabs.lhm-steps .tab-btn.active'));
assert(dialog.includes('id="btn-save-profile">Lưu hồ sơ</button>'));
// Vietnamese titles; reopen on the first tab with the name focused.
assert(renderer.includes("textContent = 'Sửa hồ sơ'") && renderer.includes("textContent = 'Tạo hồ sơ mới'"));
assert(renderer.includes(`modalProfile.querySelector('.tab-btn[data-tab="tab-general"]')?.click()`));
assert(renderer.includes('fieldName.focus()'));
// The hidden attribute always wins (the Firefox path stayed visible otherwise).
assert(css.includes('[hidden]{display:none!important}'));
console.log('Rebuilt profile editor: name first, bound labels, folded guidance, step tabs, first-tab reset and focus passed');
