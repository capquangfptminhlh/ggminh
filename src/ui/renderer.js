// State
let allProfiles = [];
let activeBrowserMap = new Map(); // profileId -> info
let currentGeneratedFP = null;

// Elements
const profileListBody = document.getElementById('profile-list-body');
const emptyState = document.getElementById('empty-state');
const statTotal = document.getElementById('stat-total');
const statActive = document.getElementById('stat-active');
const searchInput = document.getElementById('search-input');
const filterGroup = document.getElementById('filter-group');
const filterStatus = document.getElementById('filter-status');
const btnRefresh = document.getElementById('btn-refresh');

// Modals
const modalProfile = document.getElementById('modal-profile');
const modalRPA = document.getElementById('modal-rpa');
const btnCreateProfile = document.getElementById('btn-create-profile');
const btnOpenRPA = document.getElementById('btn-open-rpa');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnCloseRPA = document.getElementById('btn-close-rpa');
const btnSaveProfile = document.getElementById('btn-save-profile');

// Form Elements
const fieldId = document.getElementById('field-id');
const fieldName = document.getElementById('field-name');
const fieldGroup = document.getElementById('field-group');
const fieldStartUrl = document.getElementById('field-starturl');
const fieldNotes = document.getElementById('field-notes');
const fieldProxyType = document.getElementById('field-proxy-type');
const proxyFields = document.getElementById('proxy-fields');
const fieldProxyHost = document.getElementById('field-proxy-host');
const fieldProxyPort = document.getElementById('field-proxy-port');
const fieldProxyUser = document.getElementById('field-proxy-user');
const fieldProxyPass = document.getElementById('field-proxy-pass');
const btnTestProxy = document.getElementById('btn-test-proxy');
const proxyTestResult = document.getElementById('proxy-test-result');

// Fingerprint fields
const btnRandomFP = document.getElementById('btn-random-fp');
const fieldFpOs = document.getElementById('field-fp-os');
const fieldFpScreen = document.getElementById('field-fp-screen');
const fieldFpCores = document.getElementById('field-fp-cores');
const fieldFpMemory = document.getElementById('field-fp-memory');
const fieldFpGpu = document.getElementById('field-fp-gpu');
const fieldFpUa = document.getElementById('field-fp-ua');
const fieldFpCanvas = document.getElementById('field-fp-canvas');
const fieldFpAudio = document.getElementById('field-fp-audio');
const fieldFpWebrtc = document.getElementById('field-fp-webrtc');

// Init
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadProfiles();
  startStatusPoller();
});

function setupTabs() {
  document.querySelectorAll('.tabs').forEach(tabContainer => {
    const btns = tabContainer.querySelectorAll('.tab-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const parent = tabContainer.parentElement;
        const targetId = btn.getAttribute('data-tab');
        parent.querySelectorAll('.tab-content').forEach(content => {
          content.classList.toggle('active', content.id === targetId);
        });
      });
    });
  });
}

function setupEventListeners() {
  // Proxy Type Toggle
  fieldProxyType.addEventListener('change', () => {
    proxyFields.style.display = fieldProxyType.value === 'direct' ? 'none' : 'block';
  });

  // Modal Open / Close
  btnCreateProfile.addEventListener('click', () => openProfileModal());
  btnCloseModal.addEventListener('click', () => closeModal(modalProfile));
  btnCancelModal.addEventListener('click', () => closeModal(modalProfile));

  btnOpenRPA.addEventListener('click', () => openModal(modalRPA));
  btnCloseRPA.addEventListener('click', () => closeModal(modalRPA));

  // Randomize Fingerprint
  btnRandomFP.addEventListener('click', async () => {
    const os = fieldFpOs.value;
    const fp = await window.api.generateFingerprint({ os });
    applyFingerprintToForm(fp);
  });

  // Test Proxy
  btnTestProxy.addEventListener('click', async () => {
    proxyTestResult.textContent = 'Đang kiểm tra kết nối...';
    proxyTestResult.className = 'test-result';
    const proxyConfig = {
      type: fieldProxyType.value,
      host: fieldProxyHost.value.trim(),
      port: fieldProxyPort.value.trim(),
      user: fieldProxyUser.value.trim(),
      pass: fieldProxyPass.value.trim()
    };
    const res = await window.api.checkProxy(proxyConfig);
    if (res.status === 'success') {
      proxyTestResult.className = 'test-result success';
      proxyTestResult.textContent = `✅ Thành công! IP: ${res.ip} (${res.country || 'N/A'}) - Độ trễ: ${res.latency}ms`;
    } else {
      proxyTestResult.className = 'test-result error';
      proxyTestResult.textContent = `❌ Lỗi: ${res.message}`;
    }
  });

  // Save Profile
  btnSaveProfile.addEventListener('click', async () => {
    const name = fieldName.value.trim();
    if (!name) {
      alert('Vui lòng nhập tên Profile');
      return;
    }

    const [scrW, scrH] = fieldFpScreen.value.split('x').map(Number);
    const profile = {
      id: fieldId.value || undefined,
      name,
      group: fieldGroup.value.trim() || 'Default',
      startUrl: fieldStartUrl.value.trim() || 'https://browserleaks.com/canvas',
      notes: fieldNotes.value.trim(),
      proxy: {
        type: fieldProxyType.value,
        host: fieldProxyHost.value.trim(),
        port: fieldProxyPort.value.trim(),
        user: fieldProxyUser.value.trim(),
        pass: fieldProxyPass.value.trim()
      },
      fingerprint: {
        ...(currentGeneratedFP || {}),
        os: fieldFpOs.value,
        userAgent: fieldFpUa.value.trim(),
        hardwareConcurrency: Number(fieldFpCores.value),
        deviceMemory: Number(fieldFpMemory.value),
        screen: { width: scrW, height: scrH, availWidth: scrW, availHeight: scrH - 40, colorDepth: 24 },
        canvasNoiseSeed: fieldFpCanvas.checked ? (currentGeneratedFP?.canvasNoiseSeed || Math.random() * 1000) : 0,
        audioNoiseSeed: fieldFpAudio.checked ? (currentGeneratedFP?.audioNoiseSeed || Math.random() * 1000) : 0,
        webrtc: fieldFpWebrtc.checked ? 'spoof' : 'real'
      }
    };

    await window.api.saveProfile(profile);
    closeModal(modalProfile);
    await loadProfiles();
  });

  // Search & Filter
  searchInput.addEventListener('input', renderProfiles);
  filterGroup.addEventListener('change', renderProfiles);
  filterStatus.addEventListener('change', renderProfiles);
  btnRefresh.addEventListener('click', loadProfiles);
}

function openModal(modal) {
  modal.classList.add('open');
}

function closeModal(modal) {
  modal.classList.remove('open');
}

async function openProfileModal(existingProfile = null) {
  proxyTestResult.textContent = '';
  if (existingProfile) {
    document.getElementById('modal-title').textContent = 'Chỉnh sửa Profile';
    fieldId.value = existingProfile.id;
    fieldName.value = existingProfile.name;
    fieldGroup.value = existingProfile.group || 'Default';
    fieldStartUrl.value = existingProfile.startUrl || 'https://browserleaks.com/canvas';
    fieldNotes.value = existingProfile.notes || '';

    const pxy = existingProfile.proxy || {};
    fieldProxyType.value = pxy.type || 'direct';
    fieldProxyHost.value = pxy.host || '';
    fieldProxyPort.value = pxy.port || '';
    fieldProxyUser.value = pxy.user || '';
    fieldProxyPass.value = pxy.pass || '';
    proxyFields.style.display = fieldProxyType.value === 'direct' ? 'none' : 'block';

    currentGeneratedFP = existingProfile.fingerprint || (await window.api.generateFingerprint());
    applyFingerprintToForm(currentGeneratedFP);
  } else {
    document.getElementById('modal-title').textContent = 'Tạo Profile Mới';
    fieldId.value = '';
    fieldName.value = `Profile_${allProfiles.length + 1}`;
    fieldGroup.value = 'Default';
    fieldStartUrl.value = 'https://browserleaks.com/canvas';
    fieldNotes.value = '';
    fieldProxyType.value = 'direct';
    proxyFields.style.display = 'none';

    currentGeneratedFP = await window.api.generateFingerprint({ os: 'Windows' });
    applyFingerprintToForm(currentGeneratedFP);
  }
  openModal(modalProfile);
}

function applyFingerprintToForm(fp) {
  currentGeneratedFP = fp;
  fieldFpOs.value = fp.os || 'Windows';
  fieldFpUa.value = fp.userAgent || '';
  fieldFpGpu.value = `${fp.webgl?.renderer || 'Intel/NVIDIA GPU'}`;
  fieldFpCores.value = String(fp.hardwareConcurrency || 8);
  fieldFpMemory.value = String(fp.deviceMemory || 8);

  const scr = fp.screen || {};
  const resStr = `${scr.width || 1920}x${scr.height || 1080}`;
  if (['1920x1080', '2560x1440', '1536x864', '1440x900'].includes(resStr)) {
    fieldFpScreen.value = resStr;
  } else {
    fieldFpScreen.value = '1920x1080';
  }

  fieldFpCanvas.checked = (fp.canvasNoiseSeed !== 0);
  fieldFpAudio.checked = (fp.audioNoiseSeed !== 0);
  fieldFpWebrtc.checked = (fp.webrtc !== 'real');
}

async function loadProfiles() {
  allProfiles = await window.api.getProfiles();
  const activeList = await window.api.getActiveBrowsers();
  activeBrowserMap.clear();
  activeList.forEach(item => activeBrowserMap.set(item.profileId, item));

  // Populate Groups
  const groups = new Set(allProfiles.map(p => p.group || 'Default'));
  filterGroup.innerHTML = '<option value="all">Tất cả Nhóm</option>';
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    filterGroup.appendChild(opt);
  });

  renderProfiles();
  updateStats();
}

function updateStats() {
  statTotal.textContent = allProfiles.length;
  statActive.textContent = activeBrowserMap.size;
}

function renderProfiles() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedGroup = filterGroup.value;
  const selectedStatus = filterStatus.value;

  const filtered = allProfiles.filter(p => {
    const matchQuery = !query ||
      p.name.toLowerCase().includes(query) ||
      p.id.toLowerCase().includes(query) ||
      (p.group && p.group.toLowerCase().includes(query)) ||
      (p.proxy?.host && p.proxy.host.toLowerCase().includes(query));

    const matchGroup = selectedGroup === 'all' || (p.group || 'Default') === selectedGroup;
    const isRunning = activeBrowserMap.has(p.id);
    const matchStatus = selectedStatus === 'all' ||
      (selectedStatus === 'running' && isRunning) ||
      (selectedStatus === 'stopped' && !isRunning);

    return matchQuery && matchGroup && matchStatus;
  });

  profileListBody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach(profile => {
    const isRunning = activeBrowserMap.has(profile.id);
    const activeInfo = activeBrowserMap.get(profile.id);
    const fp = profile.fingerprint || {};

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" data-id="${profile.id}"></td>
      <td><code>${profile.id}</code></td>
      <td>
        <div class="profile-name-box">
          <span class="p-name">${escapeHtml(profile.name)}</span>
          <span class="p-group">📁 ${escapeHtml(profile.group || 'Default')}</span>
        </div>
      </td>
      <td>
        <span class="proxy-badge">
          ${profile.proxy?.type === 'direct' || !profile.proxy?.host ? '🌐 Direct (IP Máy)' : `🔒 ${profile.proxy.type.toUpperCase()}: ${profile.proxy.host}:${profile.proxy.port}`}
        </span>
      </td>
      <td>
        <div class="fp-badge-row">
          <span class="fp-pill">💻 ${fp.os || 'Windows'}</span>
          <span class="fp-pill">⚡ ${fp.hardwareConcurrency || 8} Cores</span>
          <span class="fp-pill">🧠 ${fp.deviceMemory || 8} GB</span>
          <span class="fp-pill">🖥️ ${fp.screen?.width || 1920}x${fp.screen?.height || 1080}</span>
        </div>
      </td>
      <td>
        <span class="status-pill ${isRunning ? 'running' : 'stopped'}">
          ${isRunning ? `● Port ${activeInfo.port}` : '○ Đã dừng'}
        </span>
      </td>
      <td style="text-align: right;">
        <div class="actions-cell">
          <button class="btn btn-sm ${isRunning ? 'btn-danger' : 'btn-success'} btn-toggle-run" data-id="${profile.id}">
            ${isRunning ? '⏹ Dừng' : '▶ Mở'}
          </button>
          <button class="btn btn-sm btn-secondary btn-copy-rpa" data-id="${profile.id}" title="Lấy code RPA">🤖</button>
          <button class="btn btn-sm btn-secondary btn-edit" data-id="${profile.id}">✏️</button>
          <button class="btn btn-sm btn-danger btn-delete" data-id="${profile.id}">🗑</button>
        </div>
      </td>
    `;

    // Row Actions
    const btnToggle = tr.querySelector('.btn-toggle-run');
    btnToggle.addEventListener('click', async () => {
      btnToggle.disabled = true;
      if (isRunning) {
        await window.api.stopBrowser(profile.id);
      } else {
        await window.api.startBrowser(profile.id);
      }
      await loadProfiles();
    });

    const btnRpa = tr.querySelector('.btn-copy-rpa');
    btnRpa.addEventListener('click', () => {
      openModal(modalRPA);
      // Update code examples with this profile's ID
      document.querySelectorAll('#modal-rpa code').forEach(codeElem => {
        codeElem.textContent = codeElem.textContent.replace(/pb_[a-z0-9]+/g, profile.id);
      });
    });

    const btnEdit = tr.querySelector('.btn-edit');
    btnEdit.addEventListener('click', () => openProfileModal(profile));

    const btnDelete = tr.querySelector('.btn-delete');
    btnDelete.addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa profile "${profile.name}"?`)) {
        await window.api.deleteProfile(profile.id);
        await loadProfiles();
      }
    });

    profileListBody.appendChild(tr);
  });
}

function startStatusPoller() {
  setInterval(async () => {
    const activeList = await window.api.getActiveBrowsers();
    let changed = false;
    if (activeList.length !== activeBrowserMap.size) {
      changed = true;
    } else {
      for (const item of activeList) {
        if (!activeBrowserMap.has(item.profileId)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      activeBrowserMap.clear();
      activeList.forEach(item => activeBrowserMap.set(item.profileId, item));
      renderProfiles();
      updateStats();
    }
  }, 2000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
