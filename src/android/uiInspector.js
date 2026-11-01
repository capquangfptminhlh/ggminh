'use strict';

// Read-only Android UI structure inspector. The raw UIAutomator XML may
// contain credentials, messages, OTPs or account names: never return or log it.
const MAX_XML_BYTES = 1024 * 1024;
const MAX_ELEMENTS = 120;
const SAFE_CLASS = /^[A-Za-z][A-Za-z0-9._$]{0,100}$/;

function parseBounds(value) {
  const m = /^\[(\d{1,5}),(\d{1,5})\]\[(\d{1,5}),(\d{1,5})\]$/.exec(String(value || ''));
  if (!m) return null;
  const [left,top,right,bottom] = m.slice(1).map(Number);
  if (right <= left || bottom <= top || right > 8192 || bottom > 8192) return null;
  return {
    left, top, right, bottom,
    x:Math.floor((left+right)/2),y:Math.floor((top+bottom)/2),
    width:right-left,height:bottom-top
  };
}

function attributes(tag) {
  const result = Object.create(null);
  // Parse only properties needed for a numeric metadata-only inspection.
  // Intentionally skip text, content-desc, resource-id and package.
  const RE=/\b(class|clickable|enabled|focusable|scrollable|password|bounds)="([^"]*)"/g;
  let match;
  while ((match=RE.exec(tag)) !== null) result[match[1]]=match[2];
  return result;
}

function parseHierarchy(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_XML_BYTES)
    throw new Error('Android UI dump exceeds the permitted size');
  const start=raw.indexOf('<hierarchy');
  const end=raw.indexOf('</hierarchy>',start);
  if(start<0 || end<0) throw new Error('Android did not produce a UI hierarchy; unlock the device and try again');
  const xml=raw.slice(start,end+'</hierarchy>'.length);
  const tags=xml.match(/<node\b[^>]*>/g) || [];
  if(tags.length > 3000) throw new Error('Android UI hierarchy has too many elements');
  const elements=[];
  let actionableCount=0;
  for(const tag of tags) {
    const a=attributes(tag);
    // Never expose password entry fields or their coordinates.
    if(a.password==='true') continue;
    if(a.enabled!=='true' || a.clickable!=='true') continue;
    const bounds=parseBounds(a.bounds);
    if(!bounds)continue;
    actionableCount++;
    if(elements.length===MAX_ELEMENTS)continue;
    const cls=SAFE_CLASS.test(a.class || '') ? a.class : 'android.view.View';
    elements.push({
      index:elements.length+1,
      type:cls.split('.').at(-1),
      bounds
    });
  }
  return {
    totalNodes:tags.length,
    actionableCount,
    truncated:actionableCount>MAX_ELEMENTS,
    elements,
    privacy:'geometry-only'
  };
}

class AndroidUIInspector {
  constructor(control,options={}) {
    this.control=control;
    this.execFile=options.execFile || control.execFile;
  }
  async inspect(serial) {
    const adb=await this.control.authorized(serial);
    if(this.control.busy.has(serial))throw new Error('Android device is busy');
    this.control.busy.add(serial);
    try {
      const raw=await new Promise((resolve,reject)=>{
        this.execFile(adb,['-s',serial,'exec-out','uiautomator','dump','/dev/tty'],{
          timeout:20000,maxBuffer:MAX_XML_BYTES+1,
          encoding:'utf8',shell:false,windowsHide:true
        },(error,stdout)=>{
          if(error) return reject(new Error('Cannot inspect Android UI. Unlock the screen and retry.'));
          resolve(String(stdout||''));
        });
      });
      // Only derived, metadata-only results leave main process.
      return {serial,capturedAt:Date.now(),...parseHierarchy(raw)};
    } finally {this.control.busy.delete(serial);}
  }
}

module.exports={AndroidUIInspector,parseHierarchy,parseBounds,MAX_ELEMENTS};
