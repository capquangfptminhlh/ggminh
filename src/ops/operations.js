const { checkProfile } = require('../health/profileHealth');

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
module.exports = { uniqueIds, duplicateTemplate, batchStop, overview, safeCsvCell, exportCsv };
