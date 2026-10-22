'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
