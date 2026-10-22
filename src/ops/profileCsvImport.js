'use strict';
const Store = require('../db/store');
const { parseAdsPowerProfileJson } = require('./adspowerJsonImport');

const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 200;
const COLUMNS = new Set([
  'name','group','engine','starturls','tags','notes',
  'proxytype','proxyhost','proxyport'
]);

function delimiterFor(header) {
  const counts={',':0,';':0,'\t':0};
  let quoted=false;
  for(let i=0;i<header.length;i++){
    const ch=header[i];
    if(ch==='"'){
      if(quoted && header[i+1]==='"'){i++;continue;}
      quoted=!quoted;
    }else if(!quoted && Object.prototype.hasOwnProperty.call(counts,ch)){
      counts[ch]++;
    }
  }
  return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
}

function parseDelimited(input,{allowedColumns=COLUMNS,requiredColumn='name'}={}){
  if(typeof input!=='string' || Buffer.byteLength(input,'utf8')>MAX_BYTES)
    throw Error('File CSV/TXT must be text, at most 256 KB');
  const text=input.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0];
  const sep=delimiterFor(first);
  if(!first.trim())throw Error('File must contain a CSV/TSV header');
  const rows=[], row=[];
  let value='',inside=false,closed=false;
  const cell=()=>{row.push(value);value='';closed=false;};
  const commit=()=>{
    cell();
    if(row.some(item=>item.trim()!==''))rows.push(row.slice());
    row.length=0;
    if(rows.length>MAX_ROWS+1)throw Error('Maximum 200 profiles per import');
  };
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inside){
      if(ch==='"' && text[i+1]==='"'){value+='"';i++;}
      else if(ch==='"'){inside=false;closed=true;}
      else value+=ch;
    }else if(ch==='"'){
      if(value.length || closed)throw Error('Invalid CSV quoting');
      inside=true;
    }else if(ch===sep){cell();}
    else if(ch==='\r' || ch==='\n'){
      if(ch==='\r' && text[i+1]==='\n')i++;
      commit();
    }else{
      if(closed)throw Error('Invalid text after quoted CSV field');
      value+=ch;
    }
    if(value.length>8192)throw Error('CSV field is too long');
  }
  if(inside)throw Error('Unclosed quoted CSV field');
  if(row.length || value || closed)commit();
  if(rows.length<2)throw Error('CSV must contain a header and at least one profile');
  const header=rows.shift().map(x=>x.replace(/[\s_-]+/g,'').toLowerCase());
  if(!header.includes(requiredColumn))throw Error('CSV needs a "'+requiredColumn+'" column');
  if(new Set(header).size!==header.length)throw Error('Duplicate CSV header columns');
  if(header.some(c=>!allowedColumns.has(c)))
    throw Error('Unsupported CSV column: '+header.find(c=>!allowedColumns.has(c))+
      '. Cookies, passwords, 2FA and tokens cannot be imported.');
  if(rows.length>MAX_ROWS)throw Error('Maximum 200 profiles per import');
  return rows.map((cells,index)=>{
    if(cells.length!==header.length)throw Error('Row '+(index+2)+' has an incorrect column count');
    const record=Object.create(null);
    header.forEach((h,i)=>{record[h]=cells[i].trim();});
    return record;
  });
}

function asArray(value,separator){
  return value ? value.split(separator).map(x=>x.trim()).filter(Boolean) : [];
}
function prepareImport(store,csv){
  const first = typeof csv === 'string' ? csv.replace(/^\uFEFF/, '').trimStart()[0] : '';
  const isJson = first === '{' || first === '[';
  const rows = isJson ? parseAdsPowerProfileJson(csv) : parseDelimited(csv);
  const preview=Object.create(Store.prototype);
  preview.baseDir=store.baseDir;
  preview.data=structuredClone(store.data);
  preview.saveData=()=>{};
  const created=[],groups=new Map();
  const engines={chromium:0,gecko:0};
  let proxies=0;
  for(const [i,row] of rows.entries()){
    try{
      if(!row.name)throw Error('Missing name');
      if(row.name.length>160 || (row.notes||'').length>2000)
        throw Error('Name or notes exceed field length');
      if(row.engine && !['chromium','gecko','firefox'].includes(row.engine.toLowerCase()))
        throw Error('Invalid engine');
      const type=(row.proxytype||'direct').toLowerCase();
      if(!['direct','http','socks5'].includes(type))throw Error('Invalid proxy type');
      if(type==='direct' && (row.proxyhost || row.proxyport))
        throw Error('Direct network cannot specify proxyHost or proxyPort');
      const proxy=type==='direct'?{type:'direct'}:
        {type,host:row.proxyhost||'',port:row.proxyport||''};
      const saved=preview.saveProfile({
        name:row.name,group:row.group||'Default',
        engine:row.engine?.toLowerCase()==='firefox'?'gecko':(row.engine?.toLowerCase()||'chromium'),
        startUrls:asArray(row.starturls,'|').length ? asArray(row.starturls,'|') : ['https://ads.google.com/'],
        tags:asArray(row.tags,'|'),notes:row.notes||'',
        proxy,fingerprint:{mode:'native'},
        requiresProxySetup:row.requiresproxysetup===true
      });
      created.push(saved);
      groups.set(saved.group,(groups.get(saved.group)||0)+1);
      engines[saved.engine]++;
      if(saved.proxy.type!=='direct')proxies++;
    }catch(error){
      throw Error('CSV row '+(i+2)+': '+error.message);
    }
  }
  return {preview,created,summary:{
    count:created.length,
    groups:[...groups].map(([name,count])=>({name,count})),
    engines,configuredProxies:proxies,
    proxySetupRequired:created.filter(p=>p.requiresProxySetup===true).length,
    note:isJson
      ? 'Dữ liệu AdsPower JSON chỉ nhập tên/nhóm/URL/tag. Cần cấu hình proxy trước khi mở; không nhập cookie, mật khẩu, ghi chú, fingerprint hoặc phiên đăng nhập.'
      : 'Đã kiểm tra CSV. Không nhập cookie, phiên đăng nhập, fingerprint, mật khẩu hoặc 2FA.'
  }};
}
function inspectProfilesCsv(store,csv){
  return prepareImport(store,csv).summary;
}
function importProfilesCsv(store,csv){
  const prepared=prepareImport(store,csv);
  store.licensePolicy?.assertCapacity(store.getProfiles().length,prepared.created.length);
  const previous=store.data;
  store.data=prepared.preview.data;
  try{store.saveData();}
  catch(error){store.data=previous;throw error;}
  return {...prepared.summary,profileIds:prepared.created.map(p=>p.id)};
}
module.exports={parseDelimited,inspectProfilesCsv,importProfilesCsv};