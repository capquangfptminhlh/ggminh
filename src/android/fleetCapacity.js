'use strict';

// Conservative host resource preflight, not a benchmark or an Android
// compatibility claim. Estimates may understate GPU/disk demand.
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const RESERVED_GIB = 3;
const OVERHEAD_MIB = 1024;
const DEFAULT_AVD_RAM_MIB = 4096;
const MAX_CONCURRENT = 4;

function configMemoryMiB(content) {
  const raw = String(content || '');
  const match = raw.match(/^hw\.ramSize\s*=\s*(\d+)\s*(M|G|MB|GB)?\s*$/mi);
  if (!match) return DEFAULT_AVD_RAM_MIB;
  const parsed = Number(match[1]) * (/^G/i.test(match[2] || '') ? 1024 : 1);
  if (!Number.isSafeInteger(parsed) || parsed < 1536 || parsed > 32768)
    return DEFAULT_AVD_RAM_MIB;
  // Android 17 (API 37+) increases the minimum to 4096 MiB.
  const api = raw.match(/^image\.sysdir\.1\s*=\s*.*?android-(\d+)[\\/]/mi);
  return api && Number(api[1]) >= 37 ? Math.max(parsed, 4096) : parsed;
}

function hostMemory(osApi) {
  const total = Number(osApi.totalmem());
  const free = Number(osApi.freemem());
  const cpuList = osApi.cpus();
  const cpuCount = Array.isArray(cpuList) ? cpuList.length : 0;
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(free) ||
      free < 0 || free > total) {
    return { measured:false, totalGiB:null, freeGiB:null, cpuCount };
  }
  return {
    measured: true,
    totalGiB: Math.round(total / GiB * 10) / 10,
    freeGiB: Math.round(free / GiB * 10) / 10,
    freeBytes: free,
    cpuCount
  };
}

function evaluateLaunch(host, activeCount, ramMiB) {
  // "Running" means ADB-visible emulators + LHM-owned emulator processes not
  // already represented by ADB. Physical Android phones do not consume VM slots.
  const maxParallel = Math.min(MAX_CONCURRENT, Math.max(1, Math.floor((host.cpuCount || 2) / 2)));
  const used = Math.max(0, Math.trunc(activeCount) || 0);
  const plannedMiB = Math.max(1536, Math.trunc(ramMiB) || DEFAULT_AVD_RAM_MIB);
  const requiredGiB = Math.ceil(((plannedMiB + OVERHEAD_MIB) / 1024 + RESERVED_GIB) * 10) / 10;
  const base = {allowed:false, activeCount:used, maxParallel, plannedRamMiB:plannedMiB,
    reserveGiB:RESERVED_GIB, overheadMiB:OVERHEAD_MIB, requiredFreeGiB:requiredGiB};
  if (used >= maxParallel) return {...base,reason:'parallel-limit'};
  if (!host.measured) return {...base,reason:'memory-unavailable'};
  if (host.freeBytes < (plannedMiB + OVERHEAD_MIB)*MiB + RESERVED_GIB*GiB)
    return {...base,reason:'insufficient-free-memory'};
  return {...base,allowed:true,reason:'ready'};
}

function emulatorAvdName(output) {
  // ADB emulator console responses generally include "AVD_NAME\nOK".
  // Refuse to map ambiguous or unacknowledged responses.
  const lines = String(output || '').trim().split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const name = lines[0];
  // Serial ports are recycled between AVD profiles. Require an unambiguous
  // exact emulator console response, not arbitrary extra lines containing OK.
  return lines.length===2 && lines[1]==='OK' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)
    ? name : null;
}

module.exports = {
  configMemoryMiB, hostMemory, evaluateLaunch, emulatorAvdName,
  MAX_CONCURRENT, DEFAULT_AVD_RAM_MIB
};
