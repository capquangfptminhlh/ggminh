'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkflowStore } = require('../src/automation/studio');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-workflow-durable-'));
const flow = (name, overrides={}) => ({
  name, profileId:'pb_example', hosts:'example.com',
  steps:[{type:'navigate',url:'https://example.com/'}], ...overrides
});
try {
  const workflows = new WorkflowStore(root);
  const original = workflows.save(flow('Persisted'));
  const initial = workflows.list();
  const disk = fs.readFileSync(workflows.file, 'utf8');
  const realPersist = workflows.persist;
  workflows.persist = () => { throw Error('SIMULATED_DISK_FULL'); };

  assert.throws(()=>workflows.save(flow('Uncommitted')), /SIMULATED_DISK_FULL/);
  assert.deepStrictEqual(workflows.list(), initial, 'failed create must roll back in memory');
  assert.throws(()=>workflows.save(flow('Uncommitted edit', {id:original.id})), /SIMULATED_DISK_FULL/);
  assert.deepStrictEqual(workflows.list(), initial, 'failed edit must roll back in memory');
  assert.throws(()=>workflows.delete(original.id), /SIMULATED_DISK_FULL/);
  assert.deepStrictEqual(workflows.list(), initial, 'failed delete must roll back in memory');
  assert.strictEqual(fs.readFileSync(workflows.file,'utf8'), disk, 'file must not change');

  workflows.persist = realPersist;
  const updated = workflows.save(flow('Updated', {id:original.id}));
  assert.strictEqual(updated.name, 'Updated');
  assert.strictEqual(new WorkflowStore(root).get(original.id).name, 'Updated');
  assert.strictEqual(workflows.delete(original.id), true);
  assert.deepStrictEqual(new WorkflowStore(root).list(), []);

  // When the final rename fails, the unique temporary file is removed
  // and the last committed data stays available after restart.
  workflows.save(flow('Stable'));
  const snapshot=workflows.list(), contents=fs.readFileSync(workflows.file,'utf8');
  const rename=fs.renameSync;
  try {
    fs.renameSync=()=>{throw Error('SIMULATED_RENAME_ERROR');};
    assert.throws(()=>workflows.save(flow('Should rollback')),/SIMULATED_RENAME_ERROR/);
  } finally { fs.renameSync=rename; }
  assert.deepStrictEqual(workflows.list(),snapshot);
  assert.strictEqual(fs.readFileSync(workflows.file,'utf8'),contents);
  assert.deepStrictEqual(fs.readdirSync(root).filter(x=>x.endsWith('.tmp')),[]);
  console.log('Workflow create/edit/delete atomic persistence and rollback passed');
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
