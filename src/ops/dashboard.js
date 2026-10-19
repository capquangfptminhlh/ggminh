/**
 * Local-first dashboard projection. Never invents success rates, browser
 * fingerprint safety scores, Google account status or cloud usage metrics.
 */
function buildDashboardSummary({
  profiles = [], active = [], healthReports = [],
  proxies = [], workflows = [], automation = {},
  behavior = {}
} = {}) {
  const opened = new Set(active.map(item => item.profileId));
  const warningProfiles = healthReports.filter(item => item.status === 'warning');
  const brokenProfiles = healthReports.filter(item => item.status === 'error');
  const groups = new Map();
  for (const p of profiles) {
    const name = typeof p.group === 'string' && p.group.trim()
      ? p.group.trim().slice(0, 100) : 'Default';
    if (!groups.has(name)) groups.set(name, { name, total: 0, active: 0 });
    const group = groups.get(name);
    group.total++;
    if (opened.has(p.id)) group.active++;
  }
  const nativeCount = profiles.filter(p =>
    p.engine === 'gecko' || p.fingerprint?.mode === 'native').length;
  const verified = proxies.filter(p => p.check?.verified === true).length;
  const alertCount = Array.isArray(behavior.alerts) ? behavior.alerts.length : 0;
  const recentEvents = (Array.isArray(behavior.recentEvents) ? behavior.recentEvents : [])
    .slice(0, 7).map(event => ({
      action: ['profile_open','profile_close','profile_save','profile_delete'].includes(event.action)
        ? event.action : 'unknown',
      at: Number(event.at) || null,
      profileId: String(event.profileId || '').slice(0, 64),
      source: event.source === 'api' ? 'api' : 'manual'
    }));
  return {
    profiles: {
      total: profiles.length,
      active: profiles.filter(p => opened.has(p.id)).length,
      native: nativeCount,
      experimental: profiles.length - nativeCount,
      errors: brokenProfiles.length,
      warnings: warningProfiles.length
    },
    proxies: {
      total: proxies.length,
      checked: proxies.filter(p => !!p.check).length,
      verified
    },
    automation: {
      total: workflows.length,
      running: automation.status === 'running',
      state: ['running','idle','completed','stopped','failed'].includes(automation.status)
        ? automation.status : 'idle',
      workflowName: automation.status === 'running' ?
        String(automation.workflowName || '').slice(0, 100) : ''
    },
    activity: {
      activities10m: Math.max(0, Number(behavior.activities10m) || 0),
      alertCount, recentEvents
    },
    groups: [...groups.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, 8),
    warnings: healthReports.filter(report => report.status === 'error' || report.status === 'warning')
      .slice(0, 5).map(report => {
        const match = profiles.find(p => p.id === report.profileId);
        return {
          profileName: String(match?.name || report.profileId || '').slice(0, 100),
          level: report.status,
          message: String(report.issues?.find(i => i.level === 'error' || i.level === 'warning')?.message ||
            'Cần kiểm tra cấu hình').slice(0, 220)
        };
      }),
    scopeNotice: 'Thống kê được tính từ dữ liệu LHM trên máy này, không đo khả năng Google nhận diện tài khoản.'
  };
}
module.exports = { buildDashboardSummary };
