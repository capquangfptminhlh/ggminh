'use strict';
// Rebuilt Control Tower layout contract (static). Real-app check (owner's
// window 1220x791, isolated store, two profiles needing proxy re-assignment):
// KPIs, groups, attention, cause analysis, locked handoff export, group click
// filters the table and closes, Health Check shortcut; 11/11; groups at y=119
// (was 896, below the visible 622 px).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ui, 'controlTower.js'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'workspace.css'), 'utf8');
const start = html.indexOf('<div class="modal-overlay" id="modal-control-tower">');
const dialog = html.slice(start, html.indexOf('<!-- Local-first Proxy Center', start));
const at = needle => { const i = dialog.indexOf(needle); assert(i >= 0, 'missing ' + needle); return i; };

// KPIs are header chips, not a full row of cards above the content.
const header = dialog.slice(at('<div class="modal-header">'), at('<div class="modal-body tower-content">'));
for (const id of ['tower-total', 'tower-active', 'tower-errors', 'tower-warnings']) assert(header.includes('id="' + id + '"'), id + ' in header');
// Order: groups | attention first, then cause analysis, log, agency handoff last.
assert(at('id="tower-groups"') < at('id="tower-attention"'));
assert(at('id="tower-attention"') < at('id="tower-triage-list"'));
assert(at('id="tower-triage-list"') < at('id="tower-events"'));
assert(at('id="tower-events"') < at('class="tower-panel lhm-agency-panel"'));
// Section titles are unique (two used to read "Ưu tiên xử lý").
const titles = [...dialog.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map(m => m[1].trim());
assert.strictEqual(new Set(titles).size, titles.length, 'duplicate section titles: ' + titles.join(' | '));
assert(titles.includes('Lỗi theo nguyên nhân') && titles.includes('Hồ sơ cần xử lý'));
// No English all-caps eyebrows; the handoff keeps its password field.
assert(!/FLEET OPERATIONS|AGENCY OPERATIONS/.test(dialog));
assert(dialog.includes('type="password" id="tower-agency-password"'));
// Status colour comes from the stylesheet (inline dark-theme colours were unreadable).
assert(!/style\.color\s*=/.test(js) && js.includes("display.classList.toggle('is-error', error)"));
assert(css.includes('#modal-control-tower .tower-footer p.is-error'));
assert(/#modal-control-tower \.tower-kpi\{[^}]*flex-direction:row/.test(css));
console.log('Rebuilt Control Tower: header KPIs, groups and attention first, unique titles, stylesheet status colour passed');
