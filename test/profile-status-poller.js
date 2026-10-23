'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {create,parseActiveList,differs}=require('../src/ui/profileStatusPoller');

function deferred() {
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
const rows=(...ids)=>ids.map(profileId=>({profileId}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
  assert.deepEqual(parseActiveList(rows('a','b')),rows('a','b'));
  assert.throws(()=>parseActiveList(null),/array/);
  assert.throws(()=>parseActiveList([{}]),/ID/);
  assert.throws(()=>parseActiveList(rows('x','x')),/duplicate/);
  assert.equal(differs(rows('x','y'),['y','x']),false);
  assert.equal(differs(rows('x','y'),['x','z']),true);

  let active=['a'],updates=0,reads=0;
  let current=deferred();
  const signal=[];
  const intervals=[];
  const poller=create({
    readActive:()=>{reads++;return current.promise;},
    getCurrentIds:()=>active,
    onUpdate:results=>{active=results.map(x=>x.profileId);updates++;},
    onStatus:value=>signal.push(value),
    schedule:(f,ms)=>{intervals.push({f,ms});return 12;},
    unschedule:id=>intervals.push({cleared:id})
  });
  poller.start();poller.start();
  assert.equal(intervals.length,1,'start is idempotent');
  assert.equal(intervals[0].ms,2000);
  const first=poller.poll();
  assert.strictEqual(first,poller.poll(),'duplicate polls join the same in-flight IPC');
  await tick();
  assert.equal(reads,1);
  current.resolve(rows('a','b'));
  assert.deepEqual(await first,{state:'ok'});
  assert.equal(updates,1);
  assert.deepEqual(active,['a','b']);
  assert.deepEqual(signal,['healthy']);

  current=deferred();
  const stale=poller.poll();
  await tick();
  poller.invalidate();
  current.resolve(rows('a')); // earlier read cannot override a manual full reload.
  assert.deepEqual(await stale,{state:'stale'});
  assert.deepEqual(active,['a','b']);
  assert.equal(updates,1);
  assert.deepEqual(signal,['healthy']);

  current=deferred();
  const err=poller.poll();
  await tick();
  current.reject(Error('IPC transient')); // must not reject an interval promise
  assert.deepEqual(await err,{state:'error'});
  assert.deepEqual(signal,['healthy','error']);
  assert.deepEqual(active,['a','b'],'failed IPC preserves last known state');

  current=deferred();
  const malformed=poller.poll();
  await tick();
  current.resolve([{profileId:'z'},{profileId:'z'}]);
  assert.deepEqual(await malformed,{state:'error'});
  assert.equal(updates,1,'malformed data may never modify the visible session set');
  assert.equal(signal.filter(x=>x==='error').length,1,'unchanged error does not spam aria-live');

  current=deferred();
  const recovery=poller.poll();
  await tick();
  current.resolve(rows('b','a')); // reordered IDs cannot trigger unnecessary DOM redraw
  assert.deepEqual(await recovery,{state:'ok'});
  assert.equal(updates,1);
  assert.deepEqual(signal,['healthy','error','healthy']);

  current=deferred();
  const refreshed=poller.poll();
  await tick();
  poller.invalidate();
  poller.markSnapshotLoaded(); // successful manual reload sets healthy state
  current.resolve(rows('new'));
  assert.deepEqual(await refreshed,{state:'stale'});
  assert.equal(updates,1);

  poller.stop();poller.stop();
  assert.deepEqual(await poller.poll(),{state:'stopped'});
  assert.equal(intervals.filter(x=>x.cleared===12).length,1);
  assert.throws(()=>create({}),/callbacks/);
  assert.throws(()=>create({
    readActive(){},getCurrentIds(){},onUpdate(){},onStatus(){},intervalMs:10
  }),/interval/);

  // Source contract catches removal of ordering rules in future refactors.
  const ui=path.join(__dirname,'..','src','ui');
  const html=fs.readFileSync(path.join(ui,'index.html'),'utf8');
  const renderer=fs.readFileSync(path.join(ui,'renderer.js'),'utf8');
  const css=fs.readFileSync(path.join(ui,'workspace.css'),'utf8');
  assert(html.includes('<script src="profileStatusPoller.js"></script>'));
  assert(html.indexOf('profileStatusPoller.js')<html.indexOf('<script src="renderer.js"></script>'));
  assert(html.includes('id="lhm-profile-sync-status"'));
  assert(renderer.includes('profileStatusPoller?.invalidate()'),'Full reload must supersede stale polls');
  assert(renderer.includes('Promise.all(['),'Full reload fetches a complete snapshot');
  assert(renderer.includes('if (sequence !== profileLoadSequence) return false'),
    'Older manual reload cannot overwrite latest data');
  assert(renderer.includes('window.LHMProfileStatusPoller.parseActiveList(activeList)'),
    'Invalid IPC payload must not silently clear running sessions');
  assert(renderer.includes('profileStatusPoller.markSnapshotLoaded()'));
  assert(renderer.includes('intervalMs: 2000'));
  assert(!renderer.includes('setInterval(async () => {\n    const activeList'),
    'Old overlapping async interval must be removed');
  assert(css.includes('.lhm-profile-sync-status[data-state="error"]'));
  console.log('PASS: single-flight IPC refresh, stale replies, recovery, validation, UI status and tests');
})().catch(error=>{console.error(error);process.exitCode=1;});
