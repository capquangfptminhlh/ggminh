'use strict';

// A one-time, locally held capability binds an Android touch to a real,
// freshly inspected UIAutomator node. Nothing about the Android UI contents
// or scan identifiers is sent to OpenRouter.
const crypto = require('node:crypto');
const TTL_MS = 15000;
const MAX_RECORDS = 24;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameTarget(a, b) {
  if (!a || !b || a.type !== b.type || a.role !== b.role ||
      a.hint !== b.hint || !a.bounds || !b.bounds) return false;
  return ['left','top','right','bottom','x','y'].every(k =>
    Number.isInteger(a.bounds[k]) && a.bounds[k] === b.bounds[k]);
}

class AndroidTargetGuard {
  constructor(inspector, control, options = {}) {
    this.inspector = inspector;
    this.control = control;
    this.clock = options.clock || (() => Date.now());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.records = new Map();
    this.inFlight = new Set();
  }

  cleanup() {
    for (const [id, entry] of this.records) {
      if (entry.used || this.clock() - entry.capturedAt > TTL_MS) {
        this.records.delete(id);
      }
    }
  }

  async scan(serial) {
    const result = await this.inspector.inspect(serial);
    this.cleanup();
    // Only the latest scan for each serial can approve a tap.
    for (const [id, entry] of this.records) {
      if (entry.serial === serial) this.records.delete(id);
    }
    if (this.records.size >= MAX_RECORDS) {
      this.records.delete(this.records.keys().next().value);
    }
    const scanId = this.idFactory();
    if (typeof scanId !== 'string' || !TOKEN.test(scanId)) throw new Error('Invalid scan token');
    this.records.set(scanId, {
      serial, capturedAt:this.clock(), used:false,
      elements:result.elements.map(node => ({
        index:node.index, type:node.type, role:node.role, hint:node.hint,
        bounds:{...node.bounds}
      }))
    });
    return {...result, scanId, expiresInMs:TTL_MS};
  }

  validate(serial, scanId, index) {
    this.cleanup();
    if (typeof scanId !== 'string' || !TOKEN.test(scanId) ||
        !Number.isInteger(index) || index < 1 || index > 120)
      throw new Error('Invalid inspected UI target');
    const record=this.records.get(scanId);
    if (!record || record.serial !== serial || record.used)
      throw new Error('UI target is missing, consumed or belongs to a different device');
    if (this.clock() - record.capturedAt > TTL_MS)
      throw new Error('UI scan expired; scan Android again');
    const target=record.elements.find(node => node.index === index);
    if (!target) throw new Error('Inspected UI node does not exist');
    return {serial,index,type:target.type,role:target.role,hint:target.hint,
      bounds:{...target.bounds}};
  }

  async tap(serial, scanId, index) {
    const target=this.validate(serial,scanId,index);
    const record=this.records.get(scanId);
    // Claim before any await: concurrent clicks and retries cannot replay a tap.
    record.used=true;
    this.records.delete(scanId);
    if (this.inFlight.has(serial)) throw new Error('Android inspector tap already in progress');
    this.inFlight.add(serial);
    try {
      // Re-inspect at execution time: an old center point is not evidence that
      // the intended control still occupies that area.
      const fresh=await this.inspector.inspect(serial);
      const matched=fresh.elements.find(node => node.index === index);
      if (!sameTarget(target,matched))
        throw new Error('Android UI changed: no tap was sent; scan again');
      if (this.clock() - record.capturedAt > TTL_MS)
        throw new Error('Android UI scan expired before action; no tap sent');
      await this.control.execute(serial,'tap',{
        x:target.bounds.x,y:target.bounds.y
      });
      return {serial,index,state:'executed',type:target.type};
    } finally {
      this.inFlight.delete(serial);
    }
  }

  invalidate(scanId) {
    if (typeof scanId === 'string' && TOKEN.test(scanId)) this.records.delete(scanId);
    return {state:'invalidated'};
  }
}

module.exports={AndroidTargetGuard,sameTarget,TTL_MS};
