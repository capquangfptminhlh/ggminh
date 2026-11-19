'use strict';
// Guard the real Node primitive used by the product's profile recovery lock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
try {
  db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE; CREATE TABLE probe (id INTEGER); ROLLBACK');
} finally {
  db.close();
}

// PR jobs must not fetch/run the unsigned upstream engine without opt-in.
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ip-leak-gecko.yml'), 'utf8');
assert.match(workflow, /include_camoufox:\s*\n(?:[^\n]*\n)*?\s*default:\s*false/);
assert.match(workflow, /name: Download official pinned Camoufox[^\n]*\n\s*if:\s*\$\{\{\s*github\.event_name == 'workflow_dispatch' && inputs\.include_camoufox\s*\}\}/);
console.log('Gecko CI SQLite runtime and Camoufox opt-in: PASS');
