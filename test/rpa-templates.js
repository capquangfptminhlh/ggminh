'use strict';
const assert = require('assert');
const { clean } = require('../src/automation/studio');
const { listWorkflowTemplates, draftFromTemplate } = require('../src/automation/workflowTemplates');

const templates = listWorkflowTemplates();
assert(templates.length >= 3, 'Need representative starter recipes');
assert.strictEqual(new Set(templates.map(t => t.id)).size, templates.length);
for (const tpl of templates) {
  assert(/^[a-z-]+$/.test(tpl.id));
  assert(!/cookie|credential|password|token|fingerprint/i.test(JSON.stringify(tpl)));
  assert(tpl.description && tpl.name);
  const draft = draftFromTemplate(tpl.id);
  assert.strictEqual(draft.name, tpl.name);
  const validated = clean({ ...draft, profileId: 'pb_test_template' });
  assert.strictEqual(validated.steps[0].type, 'navigate');
  assert(!validated.steps.some(s => s.type === 'fill'), 'Templates should never prefill user input');
  if (validated.steps.some(s => s.type === 'click')) {
    assert(validated.steps.some(s => s.type === 'approval'), 'Click must require approval');
  }
  draft.steps[0].url = 'https://poison.invalid/';
  assert.notStrictEqual(draftFromTemplate(tpl.id).steps[0].url, draft.steps[0].url,
    'Editing a draft must not modify a built-in template');
}
assert.throws(() => draftFromTemplate('unknown-template'), /không tồn tại/);
assert.throws(() => draftFromTemplate({ id: 'heading-check' }), /không hợp lệ/);
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../src/ui/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/ui/workflowStudio.js'), 'utf8');
const preload = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
for (const id of ['studio-template-select', 'studio-template-load'])
  assert(html.includes('id="' + id + '"'), 'Missing template UI element: ' + id);
assert(renderer.includes('refreshStarterTemplates()') && renderer.includes('loadStarterTemplate()'));
assert(preload.includes("ipcRenderer.invoke('studio-templates')"));
assert(main.includes("ipcMain.handle('studio-templates'"));
console.log('Curated RPA templates: immutable copies, valid Studio flows and approval gates passed');
