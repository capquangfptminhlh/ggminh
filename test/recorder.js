const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Store = require('../src/db/store');
const { RecorderManager, allowedHosts, cleanNavigation, cleanAction } = require('../src/automation/recorder');
const { clean } = require('../src/automation/studio');

(async () => {
  assert.deepStrictEqual(allowedHosts('example.com, example.com, demo.test'), ['example.com','demo.test']);
  assert.throws(() => allowedHosts('ads.google.com'), /Google Ads/);
  assert.throws(() => allowedHosts('bad host'), /Tên miền/);
  assert.strictEqual(cleanNavigation('https://example.com/path?secret=hello#abc',['example.com']), 'https://example.com/path');
  assert.throws(() => cleanNavigation('https://evil.test/a',['example.com']), /Tên miền/);
  assert.strictEqual(cleanAction({ type:'fill', selector:'#query', value:'PRIVATE' }).value,'');
  assert.strictEqual(cleanAction({ type:'fill', selector:'input[name="password"]' }),null);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lhm-recorder-'));
  try {
    const store = new Store(dir);
    const profile=store.saveProfile({ name:'Recorder Demo', engine:'chromium' });
    let callbacks;
    let windowClosed=0;
    const fake = () => ({
      isDestroyed: () => windowClosed > 0,
      destroy: () => { windowClosed++;callbacks.onClose(); }
    });
    const recorder = new RecorderManager(store, async options => {
      callbacks=options;
      return fake();
    });
    let state=await recorder.start({
      profileId:profile.id, hosts:'example.com', url:'https://example.com/demo?q=email'
    });
    assert.strictEqual(state.stepCount,2);
    assert.strictEqual(state.state,'recording');
    assert.strictEqual(recorder.capture({ type:'click', selector:'button#submit', url:'https://example.com/demo' }),true);
    assert.strictEqual(recorder.capture({ type:'fill', selector:'input[name="otp"]', url:'https://example.com/demo' }),false);
    assert.strictEqual(recorder.capture({ type:'fill', selector:'#q', value:'HIGHLY-SECRET', url:'https://example.com/demo' }),true);
    assert.strictEqual(recorder.capture({ type:'navigate', url:'https://example.com/results?token=abc' }),true);
    assert.strictEqual(recorder.capture({ type:'navigate', url:'https://evil.test/steal' }),false);
    assert.strictEqual(recorder.capture({ type:'navigate', url:'https://example.com/results?token=other' }),false);
    assert.throws(() => recorder.takeSteps(), /dừng ghi/);
    recorder.stop();
    state=recorder.status();
    assert.strictEqual(state.state,'stopped');
    assert.strictEqual(windowClosed,1);
    const draft=recorder.takeSteps();
    assert.strictEqual(draft.steps.length,5);
    assert.strictEqual(draft.steps[3].value,'');
    assert(!JSON.stringify(draft).includes('HIGHLY-SECRET'));
    assert(!JSON.stringify(draft).includes('token='));
    assert(!JSON.stringify(draft).includes('q=email'));
    const flow=clean({
      name:'Recorded', profileId:draft.profileId,hosts:draft.hosts,steps:draft.steps
    });
    assert.strictEqual(flow.steps.length,5);
    assert.strictEqual(flow.steps[1].type,'approval');
    assert.strictEqual(flow.steps[2].type,'click');
    assert.strictEqual(flow.steps[3].type,'fill');
    console.log('Privacy-safe action Recorder tests passed');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
