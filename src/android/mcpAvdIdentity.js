'use strict';

// An ADB emulator serial is a *port*, not a persistent AVD identity.
// If an AVD stops, another profile can inherit emulator-5554. MCP must
// recheck the named AVD before and after a read, never trusting serial alone.
const {emulatorAvdName}=require('./fleetCapacity');
const SAFE_SERIAL=/^emulator-\d{4,5}$/;
const SAFE_AVD=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_BOUND=8;

function parseAvdBindings(input) {
  const entries=typeof input==='string'
    ? input.trim()?input.split(','):[]
    : Array.isArray(input)?input:[];
  if(entries.length>MAX_BOUND)
    throw Error('At most eight explicitly bound AVDs');
  const out=new Map(),names=new Set();
  for(const entry of entries) {
    let serial,name;
    if(typeof entry==='string') {
      const split=entry.split('=');
      if(split.length!==2)throw Error('Invalid Android AVD identity binding');
      [serial,name]=split.map(x=>x.trim());
    } else if(entry && typeof entry==='object' && !Array.isArray(entry)) {
      ({serial,name}=entry);
    } else throw Error('Invalid Android AVD identity binding');
    if(typeof serial!=='string'||!SAFE_SERIAL.test(serial) ||
       typeof name!=='string'||!SAFE_AVD.test(name) ||
       out.has(serial)||names.has(name)) {
      throw Error('Invalid or duplicate Android AVD identity binding');
    }
    out.set(serial,name);
    names.add(name);
  }
  return out;
}

async function verifyBoundAvd(manager,serial,expectedName) {
  // Fail closed on unauthorized/offline/physical devices, unavailable ADB,
  // malformed AVD console replies, or a serial reused by a different profile.
  if(!SAFE_SERIAL.test(serial)||!SAFE_AVD.test(expectedName))return false;
  try {
    const adb=manager.tool('adb');
    if(!adb)return false;
    const devices=await manager.devices();
    if(!Array.isArray(devices)||!devices.some(d=>d.serial===serial &&
      d.kind==='emulator' && d.status==='device'))return false;
    const reply=await manager.run(adb,['-s',serial,'emu','avd','name']);
    return emulatorAvdName(reply)===expectedName;
  } catch (_) {
    return false;
  }
}

module.exports={parseAvdBindings,verifyBoundAvd,SAFE_SERIAL,SAFE_AVD};
