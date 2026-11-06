'use strict';
/**
 * Loopback peer guard for the local proxy gateways.
 *
 * The gateways listen on 127.0.0.1 without a password (Chromium/Firefox
 * cannot send proxy credentials from launch flags) and forward with the
 * customer's upstream proxy credentials. Without a guard ANY local process
 * — another Windows user on a shared RDP/VPS host, or any program — can
 * tunnel through a profile's paid proxy as that customer.
 *
 * On Windows the guard maps each incoming connection to the PID that owns
 * the client socket (GetExtendedTcpTable) and accepts it only when that PID
 * is the profile's own browser process or one of its descendants
 * (Chromium's network service is a child of the browser process). One
 * long-lived PowerShell helper answers lookups (~8 ms each; ~0.8 s start).
 *
 * Fail closed on Windows: if the helper cannot run (e.g. PowerShell
 * Constrained Language Mode blocks Add-Type) `ready()` rejects and the
 * launch is refused with a clear message instead of exposing the proxy.
 * Other platforms: guard disabled (behaviour unchanged, documented).
 */
const { spawn } = require('child_process');
const readline = require('readline');

const HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class LhmLoopbackPeer {
  [DllImport("iphlpapi.dll", SetLastError=true)]
  static extern uint GetExtendedTcpTable(IntPtr t, ref int size, bool order, int af, int tableClass, uint reserved);
  [StructLayout(LayoutKind.Sequential)]
  struct ROW { public uint state; public uint localAddr; public uint localPort; public uint remoteAddr; public uint remotePort; public uint owningPid; }
  static int Port(uint p) { return (int)(((p & 0xff) << 8) | ((p >> 8) & 0xff)); }
  public static int Owner(int localPort, int remotePort) {
    int size = 0; GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 5, 0);
    IntPtr buf = Marshal.AllocHGlobal(size);
    try {
      if (GetExtendedTcpTable(buf, ref size, false, 2, 5, 0) != 0) return -1;
      int n = Marshal.ReadInt32(buf); int rs = Marshal.SizeOf(typeof(ROW));
      for (int i = 0; i < n; i++) {
        ROW r = (ROW)Marshal.PtrToStructure(buf + 4 + i * rs, typeof(ROW));
        if (r.localAddr == 0x0100007f && r.remoteAddr == 0x0100007f &&
            Port(r.localPort) == localPort && Port(r.remotePort) == remotePort) return (int)r.owningPid;
      }
      return 0;
    } finally { Marshal.FreeHGlobal(buf); }
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr h, ref PE e);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr h, ref PE e);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct PE { public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID; public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szExeFile; }
  public static string Chain(int pid) {
    var parent = new Dictionary<uint,uint>();
    IntPtr h = CreateToolhelp32Snapshot(2, 0);
    try { PE e = new PE(); e.dwSize = (uint)Marshal.SizeOf(typeof(PE));
      if (Process32FirstW(h, ref e)) do { parent[e.th32ProcessID] = e.th32ParentProcessID; } while (Process32NextW(h, ref e)); }
    finally { CloseHandle(h); }
    var list = new List<string>(); uint cur = (uint)pid;
    for (int d = 0; d < 8 && cur != 0; d++) { list.Add(cur.ToString()); uint p; if (!parent.TryGetValue(cur, out p) || p == cur) break; cur = p; }
    return string.Join(",", list);
  }
}
'@
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine(); if ($line -eq $null) { break }
  $p = $line.Split(' ')
  try {
    $owner = [LhmLoopbackPeer]::Owner([int]$p[1], [int]$p[2])
    $chain = if ($owner -gt 0) { [LhmLoopbackPeer]::Chain($owner) } else { '' }
    [Console]::Out.WriteLine($p[0] + ' ' + $owner + ' ' + $chain)
  } catch { [Console]::Out.WriteLine($p[0] + ' -1 ') }
  [Console]::Out.Flush()
}
`;

const START_TIMEOUT_MS = 15000;
const LOOKUP_TIMEOUT_MS = 3000;

/** One shared helper per app process; restarted on demand if it dies. */
class WindowsPeerResolver {
  constructor({ spawnProcess = spawn } = {}) {
    this.spawnProcess = spawnProcess;
    this.child = null; this.readyPromise = null; this.waiters = new Map(); this.seq = 0;
  }
  ready() {
    if (this.readyPromise) return this.readyPromise;
    const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
    const child = this.spawnProcess('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.child = child;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(Error('Peer verification helper did not start')); try { child.kill(); } catch (_) {} }, START_TIMEOUT_MS);
      timer.unref?.();
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', line => {
        if (line === 'READY') { clearTimeout(timer); resolve(); return; }
        const [id, owner, chain = ''] = line.split(' ');
        const done = this.waiters.get(id);
        if (!done) return;
        this.waiters.delete(id);
        const ownerPid = Number(owner);
        done(ownerPid > 0 ? { ownerPid, chain: chain.split(',').filter(Boolean).map(Number) } : null);
      });
      const fail = () => {
        clearTimeout(timer);
        reject(Error('Peer verification helper is unavailable'));
        for (const done of this.waiters.values()) done(null);
        this.waiters.clear();
        if (this.child === child) { this.child = null; this.readyPromise = null; }
      };
      child.once('error', fail);
      child.once('exit', fail);
    });
    // Do not keep the app alive just for the helper.
    child.unref?.(); child.stdin?.unref?.(); child.stdout?.unref?.();
    this.readyPromise = promise;
    promise.catch(() => {});
    return promise;
  }
  async lookup(clientPort, serverPort) {
    try { await this.ready(); } catch (_) { return null; }
    const child = this.child;
    if (!child) return null;
    const id = String(++this.seq);
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.waiters.delete(id); resolve(null); }, LOOKUP_TIMEOUT_MS);
      timer.unref?.();
      this.waiters.set(id, result => { clearTimeout(timer); resolve(result); });
      try { child.stdin.write(id + ' ' + clientPort + ' ' + serverPort + '\n'); }
      catch (_) { clearTimeout(timer); this.waiters.delete(id); resolve(null); }
    });
  }
}

let sharedResolver = null;
function defaultResolver() {
  if (!sharedResolver) sharedResolver = new WindowsPeerResolver();
  return sharedResolver;
}

/**
 * Guard bound to one browser launch. `setRoot(pid)` right after spawn;
 * pass `authorize` to a gateway as `authorizePeer`.
 */
function createPeerGuard({ platform = process.platform, resolver = null } = {}) {
  const enabled = platform === 'win32';
  let rootPid = null;
  const allowed = new Set();
  const peerResolver = enabled ? (resolver || defaultResolver()) : null;
  return {
    enabled,
    async ready() {
      if (!enabled) return;
      try { await peerResolver.ready(); }
      catch (_) {
        throw Error('Không xác minh được tiến trình dùng proxy (PowerShell bị chặn). ' +
          'Hồ sơ dùng proxy có mật khẩu không được mở để tránh lộ proxy cho chương trình khác.');
      }
    },
    setRoot(pid) { if (Number.isSafeInteger(pid) && pid > 0) rootPid = pid; },
    async authorize(socket) {
      if (!enabled) return true;
      if (!rootPid || !socket) return false;
      const found = await peerResolver.lookup(socket.remotePort, socket.localPort);
      if (!found) return false;
      if (allowed.has(found.ownerPid)) return true;
      if (found.chain.includes(rootPid)) { allowed.add(found.ownerPid); return true; }
      return false;
    }
  };
}

module.exports = { createPeerGuard, WindowsPeerResolver, HELPER_SCRIPT };
