'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path').win32;
const {
  proxyEndpoint,avdNetworkMode,parseAvdProxyMap,
  resolveAvdNetworkLaunch,sanitizedEmulatorEnv
}=require('../src/android/avdNetworkPolicy');
const {AndroidManager}=require('../src/android/androidManager');
const {AndroidControl}=require('../src/android/androidControl');

function expectReject(f,part) {assert.throws(f,e=>String(e.message).includes(part));}
(async()=>{
  assert.equal(proxyEndpoint('http://proxy-a.example:3128'),
    'http://proxy-a.example:3128');
  assert.equal(proxyEndpoint('http://127.0.0.1:18080'),
    'http://127.0.0.1:18080');
  for(const value of [
    null,'',42,'https://proxy.example:3128','socks5://proxy.example:1080',
    'http://user:secret@proxy.example:3128','http://proxy.example:3128/x',
    'http://proxy.example:3128?a=1','http://proxy.example:3128/#token',
    'http://proxy.example:3128/','http://proxy.example',
    'http://proxy.example:80','http://a..b:3128',
    'http://proxy.example:3128;rm -rf /',
    'http://proxy.example:3128\n',
    'http://[::1]:3128','HTTP://proxy.example:3128'
  ])assert.throws(()=>proxyEndpoint(value),Error,'Unsafe proxy allowed: '+value);
  assert.equal(avdNetworkMode({}),'direct-unverified');
  assert.equal(avdNetworkMode({LHM_ANDROID_NETWORK_MODE:'isolated-tcp'}),
    'isolated-tcp');
  expectReject(()=>avdNetworkMode({LHM_ANDROID_NETWORK_MODE:'no-proxy'}),'Invalid');
  const entries=JSON.stringify({
    CleanA:'http://127.0.0.1:18080',
    CleanB:'http://proxy-b.example:18081'
  });
  assert.deepEqual([...parseAvdProxyMap(entries).keys()],['CleanA','CleanB']);
  for(const bad of [
    '{bad','[]','"secret"','{"../bad":"http://proxy.example:3128"}',
    JSON.stringify({A:'http://user:password@proxy.example:3128'}),
    JSON.stringify({A:'http://proxy.example:3128',
      B:'http://proxy.example:3128'})
  ])assert.throws(()=>parseAvdProxyMap(bad),Error);
  assert.deepEqual(resolveAvdNetworkLaunch('CleanA',{}),{
    mode:'direct-unverified',argv:[],status:'DIRECT_UNVERIFIED',
    udpProtected:false,publicIpVerified:false
  });
  const strict={
    LHM_ANDROID_NETWORK_MODE:'isolated-tcp',
    LHM_ANDROID_AVD_HTTP_PROXIES:entries,
    HTTP_PROXY:'http://shared-host.example:9999',
    http_proxy:'http://secret-default.example:8888',
    HTTPS_PROXY:'http://shared-host.example:7777',
    ALL_PROXY:'http://shared-host.example:6666',
    NO_PROXY:'localhost',
    ANDROID_SDK_ROOT:'C:\\Sdk'
  };
  assert.deepEqual(resolveAvdNetworkLaunch('CleanA',strict),{
    mode:'isolated-tcp',argv:['-http-proxy','http://127.0.0.1:18080'],
    status:'TCP_PROXY_CONFIGURED_UNVERIFIED',
    udpProtected:false,publicIpVerified:false
  });
  assert.deepEqual(resolveAvdNetworkLaunch('CleanB',strict).argv,
    ['-http-proxy','http://proxy-b.example:18081']);
  assert.throws(()=>resolveAvdNetworkLaunch('Unbound',strict),/required/);
  assert.throws(()=>resolveAvdNetworkLaunch('CleanA',{
    LHM_ANDROID_AVD_HTTP_PROXIES:entries
  }),/require isolated-tcp/);
  assert.deepEqual(sanitizedEmulatorEnv(strict).ANDROID_SDK_ROOT,'C:\\Sdk');
  assert.equal(sanitizedEmulatorEnv(strict).LHM_ANDROID_AVD_HTTP_PROXIES,undefined);
  assert.equal(sanitizedEmulatorEnv(strict).LHM_ANDROID_NETWORK_MODE,undefined);
  for(const key of Object.keys(sanitizedEmulatorEnv(strict)))
    assert(!/^(http_proxy|https_proxy|all_proxy|no_proxy)$/i.test(key));

  const sdk=path.join('C:', 'Sdk');
  const adb=path.join(sdk,'platform-tools','adb.exe');
  const emulator=path.join(sdk,'emulator','emulator.exe');
  const invoked=[];
  let serialName='CleanA',started=false,child=null,online=false;
  let proxyReachable=true,probeHook=null;
  const proxyCalls=[];
  const manager=new AndroidManager({
    tcpProxyProbe:async endpoint=>{
      proxyCalls.push(endpoint);
      if(probeHook)await probeHook();
      return proxyReachable;
    },
    platform:'win32',env:strict,home:'C:\\Users\\Local',
    fs:{
      statSync(file) {
        if([adb,emulator].includes(file))return {isFile:()=>true};
        throw Error('Not found');
      },
      readFileSync:()=> 'hw.ramSize=2048\n'
    },
    os:{
      totalmem:()=>32*1024**3,freemem:()=>24*1024**3,
      cpus:()=>Array(12).fill({})
    },
    execFile(file,args,opts,done) {
      invoked.push({file,args,opts});
      if(args[0]==='devices')
        return done(null,online?
          'List of devices attached\nemulator-5554\tdevice model:Pixel\n':
          'List of devices attached\n','');
      if(args[0]==='-list-avds')return done(null,'CleanA\nCleanB\nUnbound\n','');
      if(args.includes('emu')&&args.includes('name'))
        return done(null,serialName+'\nOK\n','');
      if(args.includes('getprop'))return done(null,'1\n','');
      if(args.includes('pm'))return done(null,
        'package:/data/app/com.android.chrome/base.apk\n','');
      if(args.includes('monkey'))return done(null,'Events injected: 1\n','');
      if(args.includes('am'))return done(null,
        'Starting: Intent { act=android.intent.action.VIEW }\n','');
      return done(new Error('Unexpected command '+args.join(' ')));
    },
    spawn(file,args,opts) {
      invoked.push({file,args,opts});
      child=new EventEmitter();
      child.pid=4567;
      started=true;online=true;
      return child;
    }
  });
  const discovered=await manager.discover();
  assert.equal(discovered.fleet.readiness.CleanA.allowed,true);
  assert.equal(discovered.fleet.readiness.Unbound.allowed,false);
  assert.equal(discovered.fleet.readiness.Unbound.networkState,
    'NETWORK_POLICY_BLOCKED');
  await assert.rejects(manager.launchAvd('Unbound'),/network-policy-invalid/);
  assert.equal(started,false,'Missing per-AVD proxy cannot launch directly');
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /identity could not be verified/);
  proxyReachable=false;
  await assert.rejects(manager.launchAvd('CleanA'),/CONNECT preflight/);
  assert.equal(started,false,'A dead proxy cannot cause emulator spawn');
  proxyReachable=true;
  probeHook=async()=>{throw Error('private proxy token=NeverDisplay');};
  await assert.rejects(manager.launchAvd('CleanA'),error=>
    /CONNECT preflight/.test(error.message)&&
      !/NeverDisplay|token=/.test(error.message));
  assert.equal(started,false,'An upstream error must not start an AVD');
  probeHook=null;
  const launched=await manager.launchAvd('CleanA');
  assert.equal(proxyCalls.at(-1),'http://127.0.0.1:18080');
  assert.equal(launched.networkState,'TCP_PROXY_CONFIGURED_UNVERIFIED');
  assert.equal(launched.udpProtected,false);
  assert.equal(launched.publicIpVerified,false);
  const spawned=invoked.find(x=>x.file===emulator&&x.args.includes('-avd'));
  assert.deepEqual(spawned.args,
    ['-avd','CleanA','-http-proxy','http://127.0.0.1:18080']);
  assert.equal(spawned.opts.shell,false);
  for(const key of Object.keys(spawned.opts.env))
    assert(!/^(http_proxy|https_proxy|all_proxy|no_proxy)$/i.test(key));
  assert.equal(JSON.stringify(launched).includes('127.0.0.1'),false);
  assert.equal(spawned.opts.env.LHM_ANDROID_AVD_HTTP_PROXIES,undefined);
  assert.equal(spawned.opts.env.LHM_ANDROID_NETWORK_MODE,undefined);
  const proof=await manager.assertChromeNetworkBound('emulator-5554');
  assert.equal(proof.publicIpVerified,false);
  assert.equal(proof.status,'TCP_PROXY_CONFIGURED_UNVERIFIED');
  assert.equal(proof.connectPreflight,'HTTP_CONNECT_REACHABLE_ONLY');
  const ctl=new AndroidControl(manager);
  const browser=await ctl.openBrowser('emulator-5554');
  assert.equal(browser.state,'launch-requested');
  const navigation=await ctl.navigateChrome('emulator-5554','https://example.com/');
  assert.equal(navigation.state,'intent-sent-unverified');
  const monkeyCount=invoked.filter(x=>x.args?.includes('monkey')).length;
  const amCount=invoked.filter(x=>x.args?.includes('am')).length;

  // Proxy becomes unavailable AFTER AVD startup. New Chrome actions must
  // fail before any monkey event or AM navigation reaches ADB.
  proxyReachable=false;
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /CONNECT preflight failed/);
  await assert.rejects(ctl.openBrowser('emulator-5554'),
    /CONNECT preflight failed/);
  await assert.rejects(ctl.navigateChrome('emulator-5554','https://example.com/'),
    /CONNECT preflight failed/);
  assert.equal(invoked.filter(x=>x.args?.includes('monkey')).length,monkeyCount);
  assert.equal(invoked.filter(x=>x.args?.includes('am')).length,amCount);
  proxyReachable=true;

  // A live proxy mapping changes while an AVD remains running: a prior
  // launch receipt cannot authorize the new or the old endpoint.
  const configured=strict.LHM_ANDROID_AVD_HTTP_PROXIES;
  strict.LHM_ANDROID_AVD_HTTP_PROXIES=JSON.stringify({
    CleanA:'http://127.0.0.1:19090',
    CleanB:'http://proxy-b.example:18081'
  });
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /AVD-specific TCP proxy launch not verified/);
  strict.LHM_ANDROID_AVD_HTTP_PROXIES=configured;

  // A serial can be reassigned while the TCP handshake is in progress.
  probeHook=async()=>{serialName='CleanB';};
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /identity changed during preflight/);
  serialName='CleanA';probeHook=null;

  // Config can also change during the CONNECT preflight; fail closed.
  probeHook=async()=>{strict.LHM_ANDROID_AVD_HTTP_PROXIES=JSON.stringify({
    CleanA:'http://127.0.0.1:19090',
    CleanB:'http://proxy-b.example:18081'
  });};
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /identity changed during preflight/);
  strict.LHM_ANDROID_AVD_HTTP_PROXIES=configured;probeHook=null;

  // A different AVD inherits emulator-5554. It must never inherit permissions.
  serialName='CleanB';
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /AVD-specific TCP proxy launch not verified/);
  await assert.rejects(ctl.openBrowser('emulator-5554'),
    /AVD-specific TCP proxy launch not verified/);
  await assert.rejects(ctl.navigateChrome('emulator-5554','https://example.com/'),
    /AVD-specific TCP proxy launch not verified/);
  assert.equal(invoked.filter(x=>x.args?.includes('monkey')).length,monkeyCount);
  assert.equal(invoked.filter(x=>x.args?.includes('am')).length,amCount);
  serialName='CleanA';
  child.emit('exit',0);
  assert.equal(manager.networkLaunchBindings.size,0);
  await assert.rejects(manager.assertChromeNetworkBound('emulator-5554'),
    /AVD-specific TCP proxy launch not verified/);

  // Direct mode remains explicit and labeled UNVERIFIED; no inherited shared
  // environment proxy may silently apply in this backward-compatible path.
  const direct=new AndroidManager({
    platform:'win32',env:{
      ANDROID_SDK_ROOT:sdk,HTTP_PROXY:'http://global.example:3333'
    },home:'C:\\Users\\Local',
    fs:{statSync(file){if([adb,emulator].includes(file))
      return {isFile:()=>true};throw Error('not found');}},
    os:{totalmem:()=>32*1024**3,freemem:()=>24*1024**3,
      cpus:()=>Array(8).fill({})},
    execFile:(_file,args,_opts,done)=>{
      if(args[0]==='-list-avds')return done(null,'CleanA\n','');
      if(args[0]==='devices')return done(null,'List of devices attached\n','');
      return done(null,'','');
    },
    spawn:(_file,args,opts)=>{
      assert.deepEqual(args,['-avd','CleanA']);
      assert.equal(opts.env.HTTP_PROXY,undefined);
      const p=new EventEmitter();p.pid=9900;return p;
    }
  });
  const result=await direct.launchAvd('CleanA');
  assert.equal(result.networkState,'DIRECT_UNVERIFIED');
  assert.equal(result.publicIpVerified,false);
  console.log('Android strict per-AVD TCP proxy, no inherited host proxy, identity isolation: PASS (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1;});
