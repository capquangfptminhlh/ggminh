'use strict';
// Rebuilt Proxy Center layout contract (static). Real-app check (owner's
// window 1220x791, isolated store, loopback test proxies): add, CSV import,
// edit with highlighted row and visible Save, search, delete, assign to a
// selected profile, saved to disk; 16/16.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ui, 'proxyCenter.js'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'workspace.css'), 'utf8');
const start = html.indexOf('<div class="modal-overlay" id="modal-proxy-center">');
const dialog = html.slice(start, html.indexOf('<!-- Keyboard command palette', start));

// The proxy list is the main (first) column; the form is the right column.
assert(dialog.indexOf('class="pc-list-panel"') < dialog.indexOf('class="pc-form-panel"'), 'list before form');
assert(/#modal-proxy-center \.pc-columns\{[^}]*grid-template-columns:minmax\(0,1fr\) 320px/.test(css));
// Stats moved into the header as chips (they took a full row above the list).
const header = dialog.slice(dialog.indexOf('<div class="modal-header">'), dialog.indexOf('<div class="modal-body">'));
for (const id of ['pc-total', 'pc-verified', 'pc-used']) assert(header.includes('id="' + id + '"'), id + ' in header');
// Search and the batch check share the list heading row.
const heading = dialog.slice(dialog.indexOf('class="pc-list-heading"'), dialog.indexOf('</div>', dialog.indexOf('class="pc-list-heading"')));
assert(heading.includes('id="pc-search"') && heading.includes('id="pc-check-batch"'));
// Save stays outside the scrolling form fields, so it is always visible.
const form = dialog.slice(dialog.indexOf('class="pc-form-panel"'));
assert(form.indexOf('class="pc-form-scroll"') < form.indexOf('class="pc-form-actions"'));
assert(/<div class="pc-form-actions">[\s\S]*id="pc-save"/.test(form));
assert(/#modal-proxy-center \.pc-form-scroll\{[^}]*overflow:auto/.test(css));
// The form says whether it adds or edits; the edited row is highlighted.
assert(dialog.includes('<h3 id="pc-form-title">Thêm proxy mới</h3>'));
assert(js.includes("'Sửa proxy: ' + proxy.name") && js.includes("proxy ? 'Hủy sửa' : 'Làm trống'"));
assert(js.includes("row.classList.add('is-editing')") && css.includes('#modal-proxy-center tr.is-editing td'));
// Every form field has a bound label; no dark-theme inline colours.
for (const [, id] of form.matchAll(/<(?:input|select|textarea)(?![^>]*type="hidden")(?![^>]*type="checkbox")[^>]*id="([^"]+)"/g))
  assert(form.includes('for="' + id + '"'), 'label missing for #' + id);
assert(!/style="[^"]*color:/.test(dialog));
// The table keeps its accessible structure and the restyling hook.
assert(dialog.includes('<table class="pc-table">') && css.includes('#modal-proxy-center .pc-table'));
console.log('Rebuilt Proxy Center: list-first layout, header stats, always-visible Save, add/edit mode, highlighted row passed');
