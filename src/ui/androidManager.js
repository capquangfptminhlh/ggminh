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

  function setOptions(id, options, placeholder) {
    const select = $(id);
    const previous = select.value;
    select.replaceChildren();
    if (!options.length) {
      const empty = element('option', '', placeholder);
      empty.value = '';
      select.append(empty);
      select.disabled = true;
      return;
    }
    options.forEach(({value,label}) => {
      const option = element('option','',label);
      option.value = value;
      select.append(option);
    });
    if (options.some(item => item.value === previous)) select.value = previous;
    select.disabled = false;
  }

  function renderProvisioning(state) {
    const info = state.provisioning;
    const images = info?.installedImages || [];
    const disk = info?.disk;
    const ready = !!info?.canCreate && disk?.enough !== false;
    setOptions('android-create-image', images.map(item => ({
      value:item.id, label:item.api + ' · ' + item.tag + ' · ' + item.abi
    })), 'Chưa cài Android system image');
    setOptions('android-duplicate-source', state.avds.map(name => ({
      value:name,label:name
    })), 'Chưa có AVD để nhân bản');
    const status = $('android-storage-status');
    status.textContent = disk?.checked
      ? 'Ổ trống ' + disk.freeGiB + ' GiB' +
        (disk.enough ? '' : ' · cần ít nhất 6 GiB')
      : 'Chưa đo được dung lượng ổ';
    $('android-create-submit').disabled = !ready || !images.length || !!info?.pending?.length;
    $('android-duplicate-submit').disabled = !ready || !state.avds.length || !!info?.pending?.length;
    $('android-provision-hint').textContent = !info?.canCreate
      ? 'Chưa có SDK Command-Line Tools (avdmanager). Cài trong Android Studio → SDK Manager.'
      : !images.length
        ? 'Chưa có system image trên PC. Cài image qua Android Studio → SDK Manager.'
        : disk?.enough === false
          ? 'Ổ đĩa AVD cần ít nhất 6 GiB trống trước khi tạo máy.'
          : 'Mỗi máy mới có userdata độc lập. Tạo AVD không đồng nghĩa khởi động Android.';
  }

  async function submitProvisioning(form, work) {
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    notice('Đang tạo AVD bằng Android SDK…');
    try {
      const created = await work();
      notice('Đã tạo ' + created.name + ' với dữ liệu mới độc lập. Bấm Khởi chạy để mở Android.');
      form.reset();
    } catch (error) {
      notice(error?.message || 'Không tạo được máy Android.', true);
    } finally {
      button.disabled = false;
      // Always re-read SDK state; provisioning may have changed capacity or
      // installed-image availability. The refreshed state owns button validity.
      await refresh();
    }
  }

  function blockReason(reason) {
    const messages = {
      'already-running':'Máy này đang chạy',
      'parallel-limit':'PC đã đạt giới hạn chạy song song',
      'insufficient-free-memory':'Không đủ RAM trống để mở an toàn',
      'memory-unavailable':'Không đo được bộ nhớ máy',
      'adb-unavailable':'Không tìm thấy ADB để xác nhận trạng thái máy ảo'
    };
    return messages[reason] || 'Chưa sẵn sàng';
  }

  function renderAvds(state) {
    const root = $('android-avd-list');
    root.replaceChildren();
    if (!state.tools.emulator) {
      root.append(element('p','lhm-android-empty','Chưa tìm thấy Android Emulator trong SDK hoặc PATH.'));
      return;
    }
    if (!state.avds.length) {
      root.append(element('p','lhm-android-empty','Chưa có AVD. Chọn system image phía trên để tạo máy Android mới.'));
      return;
    }
    state.avds.forEach(name => {
      const readiness = state.fleet?.readiness?.[name];
      const current = state.fleet?.running?.find(item => item.name === name);
      const starting = state.launches.includes(name);
      const running = !!current;
      const booted = current?.bootCompleted === true;
      const disabled = starting || running || !readiness?.allowed;
      const status = booted ? 'Android đã khởi động'
        : (running || starting) ? 'Đang khởi động Android'
          : readiness?.allowed ? 'Sẵn sàng khởi chạy'
            : blockReason(readiness?.reason);
      const ram = readiness?.plannedRamMiB
        ? ' · RAM AVD dự tính ' + Math.round(readiness.plannedRamMiB / 1024 * 10) / 10 + ' GB'
        : '';
      root.append(row(name, status + ram,
        [action(running || starting ? 'Đang chạy' : 'Khởi chạy', async () => {
          const result = await window.api.androidLaunchAvd(name);
          return 'Đã gửi lệnh khởi chạy ' + result.name +
            '. Màn hình Android sẽ xuất hiện khi emulator khởi động.';
        }, disabled)]));
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
      const status = state.fleet?.running?.find(item => item.serial === device.serial);
      const description = device.serial + ' · ' +
        (device.kind === 'emulator' ? 'Máy ảo' : 'Thiết bị thật') + ' · ' +
        (device.kind === 'emulator' && online
          ? (status?.bootCompleted ? 'Android đã khởi động' : 'Đang khởi động')
          : (online ? 'Đã kết nối' : device.status));
      const buttons = [
        action('Xem màn hình', async () => {
          await window.api.androidOpenScreen(device.serial);
          return 'Đã gửi lệnh mở màn hình ' + device.serial + ' qua scrcpy.';
        }, !online || !state.tools.scrcpy)
      ];
      if (online) {
        const control = element('button', 'btn btn-secondary lhm-android-action', 'Điều khiển');
        control.type = 'button';
        control.addEventListener('click', () => {
          window.LHMAndroidControlStudio?.select(device.serial);
        });
        buttons.unshift(control);
      }
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
      const fleet = state.fleet;
      $('android-host-status').textContent = fleet
        ? ('RAM trống ' + (fleet.host.measured ? fleet.host.freeGiB + ' GB' : 'chưa đo') +
          ' · CPU ' + fleet.host.cpuCount + ' luồng · ' +
          fleet.activeCount + '/' + fleet.maxParallel + ' máy Android đang chạy (giới hạn an toàn)')
        : 'Chưa đọc được trạng thái tài nguyên PC.';
      renderProvisioning(state);
      renderAvds(state);
      renderDevices(state);
      window.LHMAndroidControlStudio?.render(state);
      if (state.errors.length) notice(state.errors.join(' · '), true);
    } catch (error) {
      if (seq === generation) {
        $('android-sdk-status').textContent = 'Không đọc được trạng thái Android.';
        $('android-host-status').textContent = 'Chưa có số liệu RAM/CPU.';
        notice(error && error.message ? error.message : 'Lỗi kết nối Android IPC.', true);
      }
    } finally {
      if (seq === generation) refreshButton.disabled = false;
    }
  }

  function close() {
    window.LHMAndroidAgentStudio?.close();
    window.LHMAndroidUIInspector?.clear();
    window.LHMAndroidControlStudio?.clear();
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
    $('android-create-form').addEventListener('submit', event => {
      event.preventDefault();
      submitProvisioning(event.currentTarget, () => window.api.androidCreateAvd(
        $('android-create-name').value, $('android-create-image').value
      ));
    });
    $('android-duplicate-form').addEventListener('submit', event => {
      event.preventDefault();
      submitProvisioning(event.currentTarget, () => window.api.androidDuplicateAvd(
        $('android-duplicate-source').value, $('android-duplicate-name').value
      ));
    });
    // Only poll while the Android dialog is visible. Avoid stealing focus
    // from AVD controls or interrupting a form being filled in.
    setInterval(() => {
      if (document.hidden || !$('modal-android-manager').classList.contains('open')) return;
      if ($('android-refresh').disabled) return;
      const active = document.activeElement;
      if (active?.closest?.('#modal-android-manager .lhm-android-form, #modal-android-manager .lhm-android-item-actions')) return;
      refresh();
    }, 10000);
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
