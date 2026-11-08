'use strict';
// Diagnostic (Windows CI): which graceful close actually closes Firefox when it
// is started the way the app starts it (--wait-for-browser)? Lab tool.
const { spawn, execFile } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { createLaunchArgs } = require('../src/engine/launchArgs');
const exe = process.env.LHM_FIREFOX_EXECUTABLE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = (cmd, args) => new Promise(r => execFile(cmd, args, { windowsHide: true },
  (error, stdout, stderr) => r({ code: error ? error.code : 0, stdout: String(stdout).trim(), stderr: String(stderr).trim() })));
const tree = async () => {
  const r = await run('powershell', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='firefox.exe'\" | Select-Object ProcessId,ParentProcessId,@{n='Cmd';e={$_.CommandLine.Substring(0,[Math]::Min(80,$_.CommandLine.Length))}} | ConvertTo-Json -Compress"]);
  try { const v = JSON.parse(r.stdout || '[]'); return Array.isArray(v) ? v : [v]; } catch (_) { return []; }
};
async function attempt(label, closer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhm-ff-close-'));
  const args = createLaunchArgs({ engine: 'gecko', profileDir: dir, url: 'https://example.com/' });
  const proc = spawn(exe, args, { stdio: 'ignore' });
  let exitedAt = null, exitInfo = null;
  proc.on('exit', (code, signal) => { exitedAt = Date.now(); exitInfo = { code, signal }; });
  await sleep(9000);
  const before = await tree();
  const t0 = Date.now();
  const out = await closer(proc.pid, before);
  for (let i = 0; i < 40 && exitedAt === null; i++) await sleep(250);
  const result = { label, spawnedPid: proc.pid, processesBefore: before.length,
    browserChildren: before.filter(p => p.ParentProcessId === proc.pid).map(p => p.ProcessId),
    closer: out, exitedWithin10s: exitedAt !== null, msToExit: exitedAt ? exitedAt - t0 : null, exit: exitInfo,
    processesLeft: (await tree()).length };
  if (exitedAt === null) await run('taskkill', ['/PID', String(proc.pid), '/T', '/F']);
  await sleep(2000);
  return result;
}
(async () => {
  if (!exe) { console.log('NOT_RUN: no Firefox'); return; }
  const results = [];
  results.push(await attempt('taskkill /PID <spawned> /T', pid => run('taskkill', ['/PID', String(pid), '/T'])));
  results.push(await attempt('taskkill /PID <browser child>', async (pid, before) => {
    const child = before.find(p => p.ParentProcessId === pid);
    return child ? run('taskkill', ['/PID', String(child.ProcessId)]) : { note: 'no child found' };
  }));
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
