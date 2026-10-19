const assert = require('assert');
const { diagnoseBrowsers, parseVersion, optionsFor } = require('../src/engine/browserDiagnostics');
(async () => {
  assert.strictEqual(parseVersion('Google Chrome 154.0.8000.22'),'154.0.8000.22');
  assert.strictEqual(parseVersion('Mozilla Firefox 146.0.1'),'146.0.1');
  assert.strictEqual(parseVersion('Microsoft Edge 150.0.99'),'150.0.99');
  assert.strictEqual(parseVersion('nonsense'),null);
  const supplied={chromePath:'C:\\LHMTest\\chrome.exe',geckoPath:'C:\\LHMTest\\firefox.exe'};
  assert(optionsFor(supplied)[0].candidates.includes(supplied.chromePath));
  const commands=[];
  const probe = await diagnoseBrowsers(supplied, {
    existsSync: p => p.startsWith('C:\\LHMTest\\'),
    command: (file, args, options, callback) => {
      commands.push({file,args,options});
      if (file.endsWith('firefox.exe')) return callback(null,'Mozilla Firefox 139.0','');
      callback(null,'Google Chrome 154.0.111.0','');
    }
  });
  assert.strictEqual(probe.engines.length,3);
  assert.strictEqual(probe.engines[0].status,'ready');
  assert.strictEqual(probe.engines[1].status,'missing');
  assert.strictEqual(probe.engines[2].status,'warning');
  assert.strictEqual(commands.length,2);
  assert(commands.every(x=>x.options.shell === false && x.args[0] === '--version'));
  const failures=await diagnoseBrowsers(supplied,{
    existsSync:p=>p.startsWith('C:\\LHMTest\\'),
    command:(_f,_a,_o,done)=>done(new Error('blocked'),null,null)
  });
  assert.strictEqual(failures.engines[0].status,'error');
  assert(!failures.engines[0].message.includes('undefined'));
  console.log('Browser engine real-binary version diagnostics tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
