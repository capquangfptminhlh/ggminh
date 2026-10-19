const { checkUrl } = require('./studio');

function allowedHosts(input) {
  const list = [...new Set(String(input || '').toLowerCase()
    .split(/[\s,;]+/).map(x => x.trim()).filter(Boolean))];
  if (!list.length || list.length > 12) throw new Error('Cần 1–12 tên miền hợp lệ');
  for (const host of list) {
    if (!/^[a-z0-9.-]{1,253}$/.test(host) || host.includes('..') || host.startsWith('.') || host.endsWith('.') || (!host.includes('.') && host !== 'localhost')) {
      throw new Error('Tên miền chưa hợp lệ');
    }
    checkUrl('https://' + host + '/', list);
  }
  return list;
}

function cleanNavigation(raw, hosts) {
  const valid = new URL(checkUrl(raw, hosts));
  // Query strings and fragments can contain credentials, emails or session tokens.
  valid.search = '';
  valid.hash = '';
  return valid.toString();
}

const ACTION_TYPES = new Set(['click', 'fill']);
function cleanAction(raw) {
  if (!raw || !ACTION_TYPES.has(raw.type)) return null;
  const selector = String(raw.selector || '').trim();
  if (!selector || selector.length > 240 || /password|passcode|otp|captcha|token|secret|credit.card|card.number/i.test(selector)) return null;
  return raw.type === 'fill'
    ? { type: 'fill', selector, value: '' } // Do not collect form values.
    : { type: 'click', selector };
}
class RecorderManager {
  constructor(profileStore, createWindow) {
    this.profileStore = profileStore;
    this.createWindow = createWindow;
    this.session = null;
  }

  status() {
    const s = this.session;
    if (!s) return { state: 'idle', stepCount: 0, actions: [], notice: 'Chưa ghi hình thao tác.' };
    return {
      state: s.state, profileId: s.profileId, hosts: s.hosts.join(', '),
      stepCount: s.steps.length,
      actions: s.steps.slice(-10).map(x => x.type === 'navigate'
        ? { type: 'navigate', label: new URL(x.url).hostname }
        : { type: x.type, label: x.type === 'approval' ? 'Bước xác nhận' : x.selector }),
      notice: s.notice
    };
  }

  async start({ profileId, hosts: inputHosts, url }) {
    if (this.session?.state === 'recording') throw new Error('Đang có phiên ghi thao tác');
    const profile = this.profileStore.getProfile(profileId);
    if (!profile) throw new Error('Hồ sơ không tồn tại');
    if (profile.engine === 'gecko') throw new Error('Recorder hiện chỉ hỗ trợ Chromium sandbox');
    const hosts = allowedHosts(inputHosts);
    const cleanUrl = cleanNavigation(url, hosts);
    const session = {
      state: 'recording', profileId, hosts,
      steps: [{ type: 'navigate', url: cleanUrl },
        { type: 'approval', label: 'Tôi đã kiểm tra quy trình trước khi thao tác' }],
      notice: 'Đang ghi click và vị trí trường nhập, không ghi nội dung nhập.'
    };
    this.session = session;
    try {
      session.window = await this.createWindow({
        url: cleanUrl, profileId, hosts,
        onAction: event => { if (this.session === session) this.capture(event); },
        onClose: () => {
          if (this.session === session && session.state === 'recording') {
            session.state = 'stopped';
            session.notice = 'Đã đóng cửa sổ ghi thao tác. Bạn có thể lấy các bước đã ghi.';
          }
        }
      });
    } catch (error) {
      if (this.session === session) this.session = null;
      throw error;
    }
    return this.status();
  }

  capture(event) {
    const s = this.session;
    if (!s || s.state !== 'recording') return false;
    if (s.steps.length >= 40) {
      s.notice = 'Đạt giới hạn 40 bước; nhấn Dừng để đưa vào Studio.';
      return false;
    }
    let action;
    if (event?.type === 'navigate') {
      try { action = { type: 'navigate', url: cleanNavigation(event.url, s.hosts) }; }
      catch (_) { return false; }
    } else {
      action = cleanAction(event);
      if (!action) return false;
      try { checkUrl(event.url, s.hosts); }
      catch (_) { return false; }
    }
    const last = s.steps[s.steps.length - 1];
    if (JSON.stringify(last) === JSON.stringify(action)) return false;
    s.steps.push(action);
    return true;
  }

  stop() {
    if (!this.session) throw new Error('Chưa có phiên ghi');
    const s = this.session;
    s.state = 'stopped';
    s.notice = 'Đã dừng. Nhấn “Đưa bước vào Studio” để xem và sửa.';
    if (s.window && !s.window.isDestroyed()) s.window.destroy();
    return this.status();
  }
  takeSteps() {
    if (!this.session || this.session.state !== 'stopped') throw new Error('Hãy dừng ghi trước khi lấy bước');
    return {
      profileId: this.session.profileId, hosts: this.session.hosts.join(', '),
      steps: structuredClone(this.session.steps)
    };
  }
}
module.exports = { RecorderManager, allowedHosts, cleanNavigation, cleanAction };
