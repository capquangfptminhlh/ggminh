(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let lastFocus = null;
  let generation = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function notice(message, isError = false) {
    const area = $('android-feedback');
    area.textContent = message;
    area.dataset.state = isError ? 'error' : 'normal';
  }

  function action(label, handler, disabled = false) {
    const button = element('button', 'btn btn-secondary lhm-android-action', label);
    button.type = 'button';
    button.disabled = disabled;
    button.addEventListener('click', async () => {
      button.disabled = true;
      notice('Đang gửi lệnh đến Android SDK…');
      try {
        const result = await handler();
        await refresh();
        notice(result);
      } catch (error) {
        notice(error && error.message ? error.message : 'Không thực hiện được lệnh.', true);
      } finally {
        button.disabled = disabled;
      }
    });
    return button;
  }

  function row(title, detail, actions) {
    const item = element('div', 'lhm-android-item');
    const copy = element('div', 'lhm-android-item-copy');
    copy.append(element('strong', '', title), element('small', '', detail));
    const controls = element('div', 'lhm-android-item-actions');
    actions.forEach(button => controls.append(button));
    item.append(copy, controls);
    return item;
  }

  function renderAvds(state) {
    const root = $('android-avd-list');
    root.replaceChildren();
    if (!state.tools.emulator) {
      root.append(element('p','lhm-android-empty','Chưa tìm thấy Android Emulator trong SDK hoặc PATH.'));
      return;
    }
    if (!state.avds.length) {
      root.append(element('p','lhm-android-empty','Chưa có AVD. Tạo một thiết bị trong Android Studio → Device Manager.'));
      return;
    }
    state.avds.forEach(name => {
      const starting = state.launches.includes(name);
      root.append(row(name, starting ? 'Đang khởi động…' : 'Android Virtual Device đã cài',
        [action(starting ? 'Đang mở' : 'Khởi chạy', async () => {
          const result = await window.api.androidLaunchAvd(name);
          return 'Đã gửi lệnh khởi chạy ' + result.name + '. Kiểm tra kết nối trong danh sách thiết bị.';
        }, starting)]));
    });
  }

  function renderDevices(state) {
    const root = $('android-device-list');
    root.replaceChildren();
    if (!state.tools.adb) {
      root.append(element('p','lhm-android-empty','Chưa tìm thấy ADB (Android SDK Platform Tools).'));
      return;
    }
    if (!state.devices.length) {
      root.append(element('p','lhm-android-empty','Chưa thấy thiết bị nào. Khởi chạy một AVD hoặc kết nối điện thoại và cho phép USB Debugging.'));
      return;
    }
    state.devices.forEach(device => {
      const online = device.status === 'device';
      const title = device.model || device.serial;
      const description = device.serial + ' · ' +
        (device.kind === 'emulator' ? 'Máy ảo' : 'Thiết bị thật') + ' · ' +
        (online ? 'Đã kết nối' : device.status);
      const buttons = [
        action('Xem màn hình', async () => {
          await window.api.androidOpenScreen(device.serial);
          return 'Đã gửi lệnh mở màn hình ' + device.serial + ' qua scrcpy.';
        }, !online || !state.tools.scrcpy)
      ];
      if (device.kind === 'emulator') {
        buttons.push(action('Tắt', async () => {
          await window.api.androidStopEmulator(device.serial);
          return 'Đã gửi lệnh tắt emulator ' + device.serial + '.';
        }, !online));
      }
      root.append(row(title, description, buttons));
    });
  }

  async function refresh() {
    const seq = ++generation;
    const refreshButton = $('android-refresh');
    refreshButton.disabled = true;
    $('android-sdk-status').textContent = 'Đang kiểm tra SDK và thiết bị thực tế…';
    try {
      const state = await window.api.androidDiscover();
      if (seq !== generation) return;
      const ready = ['adb','emulator','scrcpy'].filter(x => state.tools[x]);
      $('android-sdk-status').textContent = ready.length + '/3 công cụ có sẵn · ' +
        state.avds.length + ' AVD · ' + state.devices.length + ' thiết bị';
      renderAvds(state);
      renderDevices(state);
      if (state.errors.length) notice(state.errors.join(' · '), true);
    } catch (error) {
      if (seq === generation) {
        $('android-sdk-status').textContent = 'Không đọc được trạng thái Android.';
        notice(error && error.message ? error.message : 'Lỗi kết nối Android IPC.', true);
      }
    } finally {
      if (seq === generation) refreshButton.disabled = false;
    }
  }

  function close() {
    $('modal-android-manager').classList.remove('open');
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }
  function open() {
    lastFocus = document.activeElement;
    $('modal-android-manager').classList.add('open');
    $('android-refresh').focus();
    notice('');
    refresh();
  }

  window.addEventListener('DOMContentLoaded', () => {
    $('btn-android-manager').addEventListener('click', open);
    $('android-refresh').addEventListener('click', refresh);
    $('android-close').addEventListener('click', close);
    $('android-done').addEventListener('click', close);
    $('modal-android-manager').addEventListener('click', event => {
      if (event.target === $('modal-android-manager')) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && $('modal-android-manager').classList.contains('open')) {
        event.preventDefault();
        close();
      }
    });
  });
})();
