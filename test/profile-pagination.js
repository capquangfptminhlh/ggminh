'use strict';
// Node contract for bounded client-side profile table. Metadata search remains
// global; page changes must never mutate a profile, session or selection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {paginate, SIZE_OPTIONS, DEFAULT_SIZE} = require('../src/ui/profilePagination');

assert.deepEqual(SIZE_OPTIONS, [25, 50, 100]);
assert.equal(DEFAULT_SIZE, 50);

const records = Array.from({length: 1000}, (_, i) => Object.freeze({
  id: 'p' + String(i + 1).padStart(4, '0'),
  name: 'Hồ sơ ' + (i + 1),
  group: i % 5 === 0 ? 'VIP' : 'Thường',
}));
Object.freeze(records);
const first = paginate(records, 1);
assert.equal(first.total, 1000);
assert.equal(first.pageCount, 20);
assert.equal(first.page, 1);
assert.equal(first.from, 1);
assert.equal(first.to, 50);
assert.equal(first.items.length, 50);
assert.strictEqual(first.items[0], records[0]);
assert.equal(first.hasPrevious, false);
assert.equal(first.hasNext, true);

const last = paginate(records, 20);
assert.equal(last.from, 951);
assert.equal(last.to, 1000);
assert.equal(last.items.length, 50);
assert.equal(last.hasPrevious, true);
assert.equal(last.hasNext, false);
assert.equal(paginate(records, 999).page, 20);
assert.equal(paginate(records, -99).page, 1);
assert.equal(paginate(records, Infinity).page, 1);
assert.equal(paginate(records, 2.5).page, 1);
assert.equal(paginate(records, 1, 999).size, 50);
assert.equal(paginate(records, 1, '100').size, 50);
assert.throws(() => paginate(null), /array/);

for (const size of SIZE_OPTIONS) {
  const pages = Math.ceil(records.length / size);
  const flattened = [];
  for (let n = 1; n <= pages; n++) {
    const info = paginate(records, n, size);
    assert(info.items.length <= size, 'Never materialize more than page size');
    assert(info.items.length > 0);
    flattened.push(...info.items.map(x => x.id));
  }
  assert.deepEqual(flattened, records.map(x => x.id),
    'No duplicate or skipped profiles across pages');
}

const filtered = records.filter(x => x.group === 'VIP');
assert.equal(filtered.length, 200);
assert.deepEqual(paginate(filtered, 1, 100).items, filtered.slice(0, 100),
  'Filter full dataset before slicing to page');
const empty = paginate([], 6, 25);
assert.deepEqual({total:empty.total,page:empty.page,from:empty.from,to:empty.to,items:empty.items},
  {total:0,page:1,from:0,to:0,items:[]});

// Selection semantics: changing pages must not silently include hidden IDs.
const selection = new Set();
selection.add(first.items[0].id);
selection.add(first.items[1].id);
selection.add(paginate(records, 2).items[0].id);
assert.equal(selection.size, 3);
assert.deepEqual(first.items.filter(x => selection.has(x.id)).map(x => x.id),
  [records[0].id,records[1].id]);
assert(!selection.has(paginate(records, 3).items[0].id));

// Scale invariant, not a speed claim: even 10,000 metadata profiles yield <=100 DOM rows.
const large = Array.from({length: 10000}, (_, i) => ({id:'profile-'+i}));
assert.equal(paginate(large, 25, 100).items.length, 100);
assert.equal(paginate(large, 101, 100).page, 100);

const ui = path.join(__dirname, '..', 'src', 'ui');
const html = fs.readFileSync(path.join(ui, 'index.html'),'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(ui, 'renderer.js'),'utf8');
const css = fs.readFileSync(path.join(ui, 'workspace.css'),'utf8');
const helperScript = '<script src="profilePagination.js"></script>';
const rendererScript = '<script src="renderer.js"></script>';
assert(html.includes(helperScript) && html.indexOf(helperScript) < html.indexOf(rendererScript));
for (const id of ['profile-page-controls','profile-page-size','profile-page-status','profile-page-prev','profile-page-next']) {
  assert.equal(html.split('id="' + id + '"').length, 2, id + ' must exist exactly once');
}
for (const size of SIZE_OPTIONS) assert(html.includes('<option value="' + size + '"'));
assert(renderer.includes('window.LHMProfilePagination.paginate(filtered, profilePage, profilePageSize)'));
assert(renderer.includes('pageInfo.items.forEach(profile => {'));
assert(!renderer.includes('filtered.forEach(profile => {'), 'Rendering entire filtered list breaks bounded paging');
assert(renderer.includes("profilePage = 1; renderProfiles();"), 'Search/filter must restart pagination');
assert(renderer.includes("profilePage = pageInfo.page"), 'Page must clamp after delete/refresh');
assert(renderer.includes("selectedProfileIds.add(input.dataset.id)"), 'Select-all scoped to rendered inputs');
assert(renderer.includes("profileListBody.querySelectorAll('input[type=\"checkbox\"][data-id]')"));
assert(html.includes('Chỉ chọn các hồ sơ trên trang hiện tại'), 'Select-all meaning must be explicit');
assert(renderer.includes('window.LHMTablePreferences?.apply();'), 'Column/density settings must survive');
assert(css.includes('.lhm-profile-pager[hidden]'), 'Empty pager must be hidden');
assert(css.includes('@media(max-width:640px)'), 'Pager must be responsive');
assert(mainSource.includes('1000 synthetic metadata profiles:'), 'Packaged Electron must exercise real 1,000-profile DOM');
assert(mainSource.includes("writeCapture('workspace-profile-paging-preview.png'"), 'Real paging screenshot must be captured');
assert(mainSource.includes("pagerQa.selectedCrossPage!==51"), 'Cross-page bulk selection must be verified in live Electron');
assert(mainSource.includes("pagerQa.filtered.first!=='qa_1000'"), 'Full-list search must be verified in live Electron');

console.log('PASS: 1000/10000-profile page bounds, full-set filters, 25/50/100 pages, selected IDs, renderer wiring and accessible controls');
