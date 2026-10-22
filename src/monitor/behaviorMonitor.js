const fs = require('fs');
const path = require('path');

// Monitor only actions in this application. Do not collect page content, credentials or cookies.
const RETAIN_MS = 24 * 60 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const MAX_EVENTS = 1200;
const ALLOWED = new Set(['profile_open', 'profile_close', 'profile_save', 'profile_delete']);
const SOURCES = new Set(['manual', 'api']);

class BehaviorMonitor {
  constructor(baseDir, now = () => Date.now()) {
    this.now = now;
    this.file = path.join(baseDir, 'behavior-events.json');
    this.events = [];
    if (fs.existsSync(this.file)) {
      try {
        const input = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (!Array.isArray(input)) throw new Error('Invalid history');
        this.events = input;
      } catch (error) {
        // Keep corrupt data for support; avoid deleting customer history.
        console.warn('[BehaviorMonitor] Cannot load stored history:', error.message);
      }
    }
    this.prune();
  }

  prune() {
    const cutoff = this.now() - RETAIN_MS;
    this.events = this.events.filter(e =>
      e && ALLOWED.has(e.action) && SOURCES.has(e.source) &&
      typeof e.profileId === 'string' &&
      Number.isFinite(e.at) && e.at >= cutoff && e.at <= this.now()
    ).slice(-MAX_EVENTS);
  }

  record(action, profileId, source = 'manual') {
    if (!ALLOWED.has(action) || !SOURCES.has(source)) throw new Error('Invalid activity type');
    if (typeof profileId !== 'string' || !/^[\w-]{1,64}$/.test(profileId)) throw new Error('Invalid profile ID');
    this.events.push({ action, profileId, source, at: this.now() });
    this.prune();
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(this.events), { encoding: 'utf8', mode: 0o600 });
    // mode above only applies on creation; enforce it on a reused
    // temp file too, or the rename publishes looser permissions
    // (R13 audit; same pattern as src/monitor/warningHistory.js).
    try { fs.chmodSync(temporary, 0o600); } catch (_) { /* best effort */ }
    fs.renameSync(temporary, this.file);
    return this.getReport();
  }

  getReport() {
    this.prune();
    const cutoff = this.now() - TEN_MIN;
    const recent = this.events.filter(e => e.at >= cutoff);
    const profiles = new Map();
    for (const item of recent) {
      if (!profiles.has(item.profileId)) profiles.set(item.profileId, []);
      profiles.get(item.profileId).push(item);
    }
    const alerts = [];
    function pushAlert(code, level, profileId, count, message, actions) {
      alerts.push({
        code, level, profileId, count, message,
        latestAt: Math.max(...actions.map(e => e.at))
      });
    }

    for (const [id, items] of profiles) {
      const opens = items.filter(e => e.action === 'profile_open');
      const openClose = items.filter(e => e.action === 'profile_open' || e.action === 'profile_close');
      const apiOpens = opens.filter(e => e.source === 'api');
      const saves = items.filter(e => e.action === 'profile_save');

      if (apiOpens.length >= 10) {
        pushAlert('repeat_api_open', 'high', id, apiOpens.length,
          'API liên tục yêu cầu mở cùng một hồ sơ trong 10 phút. Kiểm tra script và tạm dừng tác vụ trùng lặp.', apiOpens);
      } else if (opens.length >= 5) {
        pushAlert('repeat_open', 'medium', id, opens.length,
          'Một hồ sơ bị yêu cầu mở nhiều lần trong 10 phút. Kiểm tra quy trình thao tác.', opens);
      }
      if (openClose.length >= 10 && opens.length >= 3) {
        pushAlert('rapid_cycle', 'high', id, openClose.length,
          'Mở/đóng cùng một hồ sơ liên tục trong 10 phút. Kiểm tra lỗi hoặc vòng lặp tự động.', openClose);
      }
      if (saves.length >= 6) {
        pushAlert('repeat_update', 'medium', id, saves.length,
          'Một hồ sơ được chỉnh sửa liên tiếp nhiều lần. Xem lại quy trình quản trị.', saves);
      }
    }
    const allOpens = recent.filter(e => e.action === 'profile_open');
    if (allOpens.length >= 15) {
      pushAlert('bulk_open', 'medium', null, allOpens.length,
        'Số yêu cầu mở hồ sơ trong 10 phút tăng cao trên toàn ứng dụng. Kiểm tra tác vụ hàng loạt.', allOpens);
    }

    const levelOrder = { high: 0, medium: 1 };
    alerts.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.latestAt - a.latestAt);
    return {
      level: alerts.some(a => a.level === 'high') ? 'high' : alerts.length ? 'medium' : 'normal',
      alertCount: alerts.length,
      activities10m: recent.length,
      profileCount10m: profiles.size,
      alerts,
      // No cookies, page URLs, ad account identities, or passwords are logged.
      recentEvents: this.events.slice(-30).reverse()
    };
  }
}
module.exports = BehaviorMonitor;
