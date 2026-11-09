'use strict';
// Compact profile workspace contract (static). Real-app measurement on the
// owner's window (1220x791 CSS px): table top 604 -> 187 px, visible rows
// 1/12 -> 10/12, one visible search box, labeled side navigation.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'compactWorkspace.css'), 'utf8');
const js = fs.readFileSync(path.join(ui, 'compactWorkspace.js'), 'utf8');
const renderer = fs.readFileSync(path.join(ui, 'renderer.js'), 'utf8');

// Loaded after every other stylesheet so it wins the layered overrides.
const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
assert.strictEqual(sheets.at(-1), 'compactWorkspace.css', 'compactWorkspace.css must load last');
assert(html.includes('<script src="compactWorkspace.js"></script>'));

// Every side-nav button shows a short visible label.
const navButtons = [...html.matchAll(/<button type="button" class="lhm-nav-btn[^"]*" data-lhm-target="[^"]+"([^>]*)>/g)];
assert(navButtons.length >= 9, 'side-nav buttons found: ' + navButtons.length);
for (const [tag, attrs] of navButtons) assert(/data-short="[^"]+"/.test(attrs), 'missing data-short: ' + tag);
assert(css.includes('content:attr(data-short)'));

// Secondary filters live in the "Lọc" menu; ids unchanged for renderer.js.
const filterMenu = html.slice(html.indexOf('id="lhm-filter-menu"'), html.indexOf('</details>', html.indexOf('id="lhm-filter-menu"')));
for (const id of ['filter-group', 'filter-tag', 'filter-engine', 'filter-proxy', 'lhm-filter-clear', 'btn-table-options', 'lhm-filter-count'])
  assert(filterMenu.includes('id="' + id + '"'), id + ' must be inside the filter menu');
// Status tabs moved into the toolbar; the duplicate status select is hidden.
const toolbar = html.slice(html.indexOf('<section class="toolbar">'), html.indexOf('</section>', html.indexOf('<section class="toolbar">')));
assert(toolbar.includes('class="lhm-list-tabs"'), 'status tabs belong in the toolbar row');
assert(css.includes('body[data-view="profiles"] #filter-status{display:none!important}'));
// One visible search box: the header one (Ctrl K) mirrors into #search-input.
assert(css.includes('body[data-view="profiles"] .toolbar .search-box'));
// Quick actions sit on the heading row (ads review must stay discoverable).
const actions = html.slice(html.indexOf('id="lhm-profiles-actions"'), html.indexOf('</div>', html.indexOf('id="lhm-profiles-actions"')));
assert(actions.includes('id="lhm-open-ads-review"') && actions.includes('id="lhm-v7-show-rail"'));
// Heading/toolbar must not zero their side margins: they reserve the AI rail.
for (const rule of css.match(/body\[data-view="profiles"\] \.(?:lhm-profiles-heading|toolbar)\{[^}]*\}/g))
  assert(!/(^|[;{])\s*margin:\s*0/.test(rule) && !/(^|[;{])\s*padding:/.test(rule), 'rail offset overridden: ' + rule);

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
console.log('Compact profile workspace layout contract passed');
