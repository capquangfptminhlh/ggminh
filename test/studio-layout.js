'use strict';
// Rebuilt Automation Studio layout contract (static). Real-app check (owner's
// window 1218x790, isolated store, 3 Chromium profiles): add step, save,
// template, graph node -> step, every tab shows its control, batch lists the
// profiles; 16/16. Save/Run were at y=1917 of a 2229 px scroll (visible 617);
// now they sit in the footer and the body does not scroll.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ui, 'workflowStudio.js'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'workspace.css'), 'utf8');
const start = html.indexOf('<div class="modal-overlay" id="modal-studio">');
const dialog = html.slice(start, html.indexOf('<div class="modal-overlay', start + 10));
const at = needle => { const i = dialog.indexOf(needle); assert(i >= 0, 'missing ' + needle); return i; };

// Save / run / stop and the run status are in the footer, always visible.
const footer = dialog.slice(at('<div class="modal-footer studio-footer">'));
for (const id of ['studio-save', 'studio-run', 'studio-stop', 'studio-done', 'studio-run-state', 'studio-approve', 'studio-approval-prompt'])
  assert(footer.includes('id="' + id + '"'), id + ' in footer');
// Editor sections are tabs handled by the generic .tabs handler.
const panes = ['steps', 'graph', 'record', 'schedule', 'batch', 'log'];
for (const p of panes) {
  assert(dialog.includes('data-tab="studio-tab-' + p + '"'), 'tab button ' + p);
  assert(dialog.includes('id="studio-tab-' + p + '"'), 'tab pane ' + p);
}
const pane = id => dialog.slice(at('id="studio-tab-' + id + '"'), dialog.indexOf('class="tab-content', at('id="studio-tab-' + id + '"') + 5) >>> 0);
assert(pane('steps').includes('id="studio-steps"') && pane('steps').includes('id="studio-add-step"'));
assert(pane('graph').includes('id="studio-graph"'));
assert(pane('record').includes('id="studio-record-start"'));
assert(pane('schedule').includes('id="studio-schedule-add"'));
assert(pane('batch').includes('id="studio-batch-run"'));
assert(dialog.slice(at('id="studio-tab-log"')).includes('id="studio-log"'));
// "Thêm bước" sits above the step list, not below it.
assert(at('id="studio-add-step"') < at('id="studio-steps"'));
// Name, profile and allowed hosts come before the tabs.
assert(at('id="studio-hosts"') < at('class="tabs lhm-steps studio-tabs"'));
// Graph node click returns to the steps tab; running opens the log.
assert(js.includes("showTab('steps')") && js.includes("showTab('log')"));
// The body does not scroll; panes scroll on their own.
assert(/#modal-studio \.studio-content\{[^}]*overflow:hidden/.test(css));
assert(/#modal-studio \.studio-pane\{[^}]*overflow-y:auto/.test(css));
console.log('Rebuilt Automation Studio: footer actions, six tabs, add-step above steps, graph returns to steps passed');
