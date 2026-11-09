'use strict';
// UI rebuild phase 7: the main stylesheets carry no dead rules (every rule has
// at least one selector whose classes/ids exist in the UI markup or scripts),
// and visible section labels are Vietnamese, not English all-caps eyebrows.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const ui = path.join(repo, 'src', 'ui');
const corpus = fs.readdirSync(ui).filter(f => /\.(html|js)$/.test(f)).map(f => fs.readFileSync(path.join(ui, f), 'utf8')).join('\n')
  + fs.readFileSync(path.join(repo, 'main.js'), 'utf8');
const words = new Set(corpus.match(/[A-Za-z_][\w-]*/g));

function rules(text) {
  const out = []; let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i); if (open < 0) break;
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const prelude = text.slice(i, open).trim();
    if (prelude.startsWith('@')) out.push(...rules(text.slice(open + 1, j - 1)));
    else if (prelude) out.push(prelude);
    i = j;
  }
  return out;
}
const deadSelector = sel => [...sel.replace(/:(not|is|where|has)\([^)]*\)/g, '').matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].some(m => !words.has(m[1]));
for (const file of ['styles.css', 'system.css', 'workspace.css']) {
  const css = fs.readFileSync(path.join(ui, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const dead = rules(css).filter(p => p.split(',').map(s => s.trim()).filter(Boolean).every(deadSelector));
  assert.deepStrictEqual(dead, [], file + ' has rules for classes/ids that no longer exist');
}

const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
for (const label of ['AI CONTROL CENTER', 'PROFILE OPERATIONS', 'WORKSPACE / OVERVIEW', 'NETWORK MANAGEMENT',
  'LOCAL AUDIT TRAIL', 'WORKSPACE ORGANIZATION', 'CUSTOMER HANDOFF', 'LOCAL-ONLY QA', 'LOCAL ADB', 'REVIEW EACH STEP'])
  assert(!html.includes(label), 'English all-caps label left: ' + label);
assert(!/text-transform:\s*uppercase/.test(fs.readFileSync(path.join(ui, 'adsLaunchGuard.css'), 'utf8')));
console.log('UI CSS hygiene: no dead rules in styles/system/workspace.css, no English all-caps labels passed');
