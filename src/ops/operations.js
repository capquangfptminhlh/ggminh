const { checkProfile } = require('../health/profileHealth');
const { cleanTags } = require('../db/store');

function uniqueIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50) {
    throw new Error('Chọn từ 1 đến 50 hồ sơ');
  }
  const unique = [...new Set(ids)];
  if (unique.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))) {
    throw new Error('Danh sách hồ sơ không hợp lệ');
  }
  return unique;
}

// Copies only the public configuration. A new profile starts with an empty browser
// session and no copied fingerprints or credentials.
function duplicateTemplate(store, id) {
  const original = store.getProfile(id);
  if (!original) throw new Error('Hồ sơ gốc không tồn tại');
  return store.saveProfile({
    name: (original.name.slice(0, 135) + ' - Bản sao'),
    group: original.group,
    engine: original.engine,
    startUrl: original.startUrl,
    startUrls: original.startUrls || [original.startUrl],
    tags: original.tags || [],
    proxy: original.proxy?.authProxyId ? {type:original.proxy.type,host:original.proxy.host,port:original.proxy.port} : { ...original.proxy },
    fingerprint: {},
    notes: ''
  });
}

function batchStop(store, launcher, ids, monitor) {
  const selected = uniqueIds(ids);
  const results = [];
  for (const id of selected) {
    if (!store.getProfile(id)) {
      results.push({ id, status: 'missing' });
      continue;
    }
    try {
      const result = launcher.stop(id);
      if (result.success) {
        if (monitor) monitor.record('profile_close', id, 'manual');
        results.push({ id, status: 'stopped' });
      } else {
        results.push({ id, status: 'not_running' });
      }
    } catch (error) {
      results.push({ id, status: 'error', message: String(error.message).slice(0, 200) });
    }
  }
  return {
    requested: selected.length,
    stopped: results.filter(x => x.status === 'stopped').length,
    results
  };
}

/**
 * Bounded manual launch. One failed profile must not prevent others.
 * Prevalidates IDs and caps concurrent child browser startups at two.
 * No background scheduling or hidden website actions.
 */
async function batchOpen(store,launcher,ids,monitor,{concurrency=2}={}) {
  const selected=uniqueIds(ids);
  if(selected.length>10)throw Error('Chỉ mở tối đa 10 hồ sơ mỗi lượt để bảo vệ tài nguyên máy');
  const limit=Math.min(2,Math.max(1,Math.floor(Number(concurrency)||1)));
  const results=new Array(selected.length);
  let cursor=0;
  const work=async()=>{
    while(cursor<selected.length){
      const index=cursor++;
      const id=selected[index];
      if(!store.getProfile(id)){
        results[index]={id,status:'missing'};continue;
      }
      if(launcher.isBusy(id)){
        results[index]={id,status:'already_running'};continue;
      }
      try {
        const opened=await launcher.start(id);
        if(opened.alreadyRunning)results[index]={id,status:'already_running'};
        else{
          monitor?.record('profile_open',id,'manual');
          results[index]={id,status:'opened'};
        }
      }catch(error) {
        results[index]={id,status:'error',message:String(error.message||'Không thể mở hồ sơ').slice(0,160)};
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(limit,selected.length)},()=>work()));
  return {requested:selected.length,opened:results.filter(r=>r.status==='opened').length,
    failed:results.filter(r=>r.status==='error').length,results};
}

/**
 * Atomic group name updates in the local JSON database. Does not change
 * sessions, proxy assignments, or fingerprints.
 */
function batchAssignGroup(store,launcher,ids,group,monitor) {
  const selected=uniqueIds(ids);
  if(typeof group!=='string'||!group.trim()||group.trim().length>100||
      /[\u0000-\u001f]/.test(group))
    throw Error('Tên nhóm phải có 1–100 ký tự hợp lệ');
  const name=group.trim();
  for(const id of selected){
    if(!store.getProfile(id))throw Error('Hồ sơ không tồn tại: '+id);
    if(launcher.isBusy(id))throw Error('Hãy đóng hồ sơ trước khi chuyển nhóm: '+id);
  }
  const oldData=store.data;
  const updated=structuredClone(oldData);
  for(const item of updated.profiles){
    if(selected.includes(item.id)){
      item.group=name;
      item.updatedAt=new Date().toISOString();
    }
  }
  store.data=updated;
  try{store.saveData();}
  catch(error){store.data=oldData;throw error;}
  for(const id of selected)monitor?.record('profile_save',id,'manual');
  return {updated:selected.length,group:name};
}

/**
 * Transactional tag changes. Tags are local bookkeeping only; browser
 * processes, proxy credentials, cookies and identities remain unchanged.
 * All selected IDs and final tag sets are validated before one disk write.
 */
function batchAssignTags(store,ids,inputTags,mode,monitor){
  const selected=uniqueIds(ids);
  if(!['add','remove','replace'].includes(mode))throw Error('Invalid tag operation');
  const tags=cleanTags(inputTags);
  if(mode!=='replace' && !tags.length)throw Error('At least one tag is required');
  const existing=new Map(store.getProfiles().map(p=>[p.id,p]));
  for(const id of selected)
    if(!existing.has(id))throw Error('Profile does not exist: '+id);
  const next=structuredClone(store.data);
  const idsSet=new Set(selected);
  const keys=new Set(tags.map(tag=>tag.toLocaleLowerCase('vi-VN')));
  for(const profile of next.profiles){
    if(!idsSet.has(profile.id))continue;
    const current=cleanTags(profile.tags||[]);
    let updated;
    if(mode==='replace')updated=tags;
    else if(mode==='remove')
      updated=current.filter(tag=>!keys.has(tag.toLocaleLowerCase('vi-VN')));
    else {
      updated=current.slice();
      const has=new Set(current.map(t=>t.toLocaleLowerCase('vi-VN')));
      for(const tag of tags) {
        if(!has.has(tag.toLocaleLowerCase('vi-VN')))updated.push(tag);
        has.add(tag.toLocaleLowerCase('vi-VN'));
      }
    }
    profile.tags=cleanTags(updated);
    profile.updatedAt=new Date().toISOString();
  }
  const previous=store.data;
  store.data=next;
  try{store.saveData();}
  catch(error){store.data=previous;throw error;}
  for(const id of selected)monitor?.record('profile_save',id,'manual');
  return {updated:selected.length,mode};
}

function overview(profiles, active, healthReports, behaviorReport) {
  const activeIds = new Set(active.map(a => a.profileId));
  const health = new Map(healthReports.map(item => [item.profileId, item]));
  const groups = new Map();
  for (const profile of profiles) {
    const name = String(profile.group || 'Default').slice(0, 100);
    if (!groups.has(name)) groups.set(name, { name, total: 0, running: 0, errors: 0, warnings: 0 });
    const group = groups.get(name);
    group.total += 1;
    if (activeIds.has(profile.id)) group.running += 1;
    if (health.get(profile.id)?.status === 'error') group.errors += 1;
    if (health.get(profile.id)?.status === 'warning') group.warnings += 1;
  }
  const activeRecords = profiles.filter(p => activeIds.has(p.id));
  return {
    total: profiles.length, active: activeRecords.length,
    stopped: profiles.length - activeRecords.length,
    errorCount: healthReports.filter(h => h.status === 'error').length,
    warningCount: healthReports.filter(h => h.status === 'warning').length,
    alertCount: behaviorReport?.alertCount || 0,
    groups: [...groups.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name)),
    attention: healthReports.filter(h => h.status === 'error' || h.status === 'warning')
      .slice(0, 30).map(h => ({
        profileId: h.profileId,
        name: profiles.find(p => p.id === h.profileId)?.name || h.profileId,
        level: h.status,
        problems: h.issues.filter(x => x.level !== 'notice').map(x => x.message).slice(0, 3)
      })),
    alerts: (behaviorReport?.alerts || []).slice(0, 15),
    recentEvents: (behaviorReport?.recentEvents || []).slice(0, 20)
  };
}
function safeCsvCell(value) {
  let text = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').slice(0, 250);
  // Defend against CSV/Excel formula injection, even after leading whitespace.
  if (/^[\s]*[=+\-@\t]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function exportCsv(profiles, reports, active) {
  const lookup = new Map(reports.map(x => [x.profileId, x]));
  const online = new Set(active.map(x => x.profileId));
  const rows = [['Profile ID', 'Tên hồ sơ', 'Nhóm', 'Engine', 'Trạng thái', 'Health', 'Proxy loại', 'Proxy host', 'Proxy port', 'Ngày tạo']];
  for (const p of profiles) {
    const proxy = p.proxy || {};
    rows.push([
      p.id, p.name, p.group || 'Default',
      p.engine === 'gecko' ? 'Gecko' : 'Chromium',
      online.has(p.id) ? 'Đang chạy' : 'Đã dừng',
      lookup.get(p.id)?.status || 'Chưa kiểm tra',
      proxy.type || 'direct', proxy.host || '', proxy.port || '', p.createdAt || ''
    ]);
  }
  return '\uFEFF' + rows.map(row => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n';
}
module.exports = { uniqueIds, duplicateTemplate, batchStop, batchOpen, batchAssignGroup, batchAssignTags, overview, safeCsvCell, exportCsv };
