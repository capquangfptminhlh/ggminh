'use strict';
// Design-system and compact profile workspace contract (static).
// Real-app measurement on the owner's window (1220x791 CSS px): table top
// 604 -> 160 px, visible rows 1/12 -> 10/12, one visible search box, labeled
// side navigation; all 25 dialogs render with no invisible text.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const read = f => fs.readFileSync(path.join(ui, f), 'utf8');
const html = read('index.html');
const css = read('system.css');
const js = read('compactWorkspace.js');
const renderer = read('renderer.js');

// One design system right after the legacy base; the replaced skins are gone.
const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
assert.deepStrictEqual(sheets.slice(0, 2), ['styles.css', 'system.css'], 'system.css must follow styles.css');
for (const skin of ['premiumWorkspace.css', 'neumorphicWorkspace.css', 'compactWorkspace.css']) {
  assert(!sheets.includes(skin), skin + ' must not be loaded again');
  assert(!fs.existsSync(path.join(ui, skin)), skin + ' must stay deleted');
}
assert(sheets.includes('licenseCenter.css'), 'the license card keeps its own sheet');
assert(html.includes('<script src="compactWorkspace.js"></script>'));
// Tokens are defined once, in system.css.
assert(/:root\{[^}]*--lhm-heading:/.test(css) && /--lhm-rail-space:/.test(css));
assert(!/:root\{[^}]*--lhm-heading:/.test(read('commercialPolish.css')), 'tokens must not be redefined');
// Former dark component sheets now use the tokens (they were unreadable once
// the skin that lightened them was removed).
for (const sheet of ['fleetTriage.css', 'agencyHandoff.css'])
  assert(!/linear-gradient\([^)]*#1[0-9a-f]{5}/i.test(read(sheet)), sheet + ' must not paint dark panels');

// Every side-nav button shows a short visible label.
const navButtons = [...html.matchAll(/<button type="button" class="lhm-nav-btn[^"]*" data-lhm-target="[^"]+"([^>]*)>/g)];
assert(navButtons.length >= 9, 'side-nav buttons found: ' + navButtons.length);
for (const [tag, attrs] of navButtons) assert(/data-short="[^"]+"/.test(attrs), 'missing data-short: ' + tag);
assert(css.includes('content:attr(data-short)'));

// Secondary filters live in the "Lọc" menu; ids unchanged for renderer.js.
const filterMenu = html.slice(html.indexOf('id="lhm-filter-menu"'), html.indexOf('</details>', html.indexOf('id="lhm-filter-menu"')));
for (const id of ['filter-group', 'filter-tag', 'filter-engine', 'filter-proxy', 'lhm-filter-clear', 'btn-table-options', 'lhm-filter-count'])
  assert(filterMenu.includes('id="' + id + '"'), id + ' must be inside the filter menu');
const toolbar = html.slice(html.indexOf('<section class="toolbar">'), html.indexOf('</section>', html.indexOf('<section class="toolbar">')));
assert(toolbar.includes('class="lhm-list-tabs"'), 'status tabs belong in the toolbar row');
assert(css.includes('body[data-view="profiles"] #filter-status{display:none}'));
// One visible search box: the header one (Ctrl K) mirrors into #search-input.
assert(css.includes('.toolbar .search-box,body[data-view="profiles"] #filter-status{display:none}'));
const actions = html.slice(html.indexOf('id="lhm-profiles-actions"'), html.indexOf('</div>', html.indexOf('id="lhm-profiles-actions"')));
assert(actions.includes('id="lhm-open-ads-review"') && actions.includes('id="lhm-v7-show-rail"'));
// The AI rail is reserved through one variable, freed when closed or narrow.
assert(css.includes('margin-right:calc(var(--lhm-rail-space) + var(--lhm-page-x))'));
assert(css.includes('body[data-lhm-rail="closed"]{--lhm-rail-space:0px}'));
assert(/@media\(max-width:1270px\)\{:root\{--lhm-rail-space:0px\}\}/.test(css));

// Row actions: Open + Edit with text, the rest in a labeled menu.
const row = renderer.slice(renderer.indexOf('<div class="actions-cell">'), renderer.indexOf('</div></td>', renderer.indexOf('<div class="actions-cell">')));
assert(/btn-toggle-run[\s\S]*btn-edit[\s\S]*<details class="lhm-row-more">/.test(row), 'Mở, Sửa, then the ⋯ menu');
const menu = row.slice(row.indexOf('<details class="lhm-row-more">'));
for (const [cls, label] of [['btn-health', 'Kiểm tra cấu hình'], ['btn-copy-rpa', 'Tùy chọn RPA'], ['btn-delete', 'Xóa hồ sơ']])
  assert(menu.includes(cls) && menu.includes(label), cls + ' must be a labeled menu item');
// An open row menu must stack above the following rows (they covered it).
assert(css.includes('tr:has(.lhm-row-more[open])') && /z-index:\s*80/.test(css));

// Menus close on outside click / Escape / after an action; one row menu open.
for (const needle of ["event.key!=='Escape'", ".lhm-row-menu button", "other.open=false", "badge.hidden=active===0"])
  assert(js.includes(needle), 'compactWorkspace.js missing: ' + needle);
console.log('Design system and compact profile workspace contract passed');
