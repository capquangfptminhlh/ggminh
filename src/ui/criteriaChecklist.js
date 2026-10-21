(() => {
  'use strict';
  // Khung hiển thị "Bảng kiểm theo tiêu chí" cho một hồ sơ.
  //
  // Module này CHỈ hiển thị. Nó không tự đo, không tự kết luận và không
  // tự gán trạng thái: trạng thái của từng tiêu chí phải do nguồn dữ
  // liệu đo của ứng dụng cung cấp (tích hợp sau — xem INTEGRATION-NOTES.md).
  // Khi chưa có nguồn dữ liệu đo nối vào, mọi tiêu chí hiển thị CHƯA ĐO,
  // đúng định nghĩa trạng thái trong tiêu chí sản phẩm: chưa có bằng
  // chứng đủ thì không kết luận, và không có kết luận tổng hợp kiểu
  // "sạch toàn bộ" — mỗi tiêu chí được đọc riêng theo bằng chứng của nó.
  //
  // Hợp đồng dữ liệu (model) mà nguồn đo phải cung cấp cho renderInto():
  //   { profileName: string|null, sample: boolean,
  //     entries: [{ id, status: 'pass'|'fail'|'unmeasured',
  //                 evidence, observedAt, method, limit, nextStep }] }
  // Năm trường evidence/observedAt/method/limit/nextStep tương ứng các
  // câu hỏi bằng chứng bắt buộc của một cảnh báo: quan sát thấy gì, ở
  // hồ sơ nào (profileName), lúc nào và bằng cách nào, so với tiêu chí
  // nào (nhãn + phạm vi của tiêu chí), giới hạn của kết luận, và bước
  // kiểm tra/xử lý tiếp theo của người dùng.
  const CRITERIA = [
    {
      id: 'storage-isolation',
      label: 'Cách ly dữ liệu giữa các hồ sơ',
      scope: 'Cookie, localStorage, IndexedDB, Cache Storage và Service Worker — chỉ trong các phép thử đã thực hiện'
    },
    {
      id: 'self-consistency',
      label: 'Tự nhất quán của các giá trị hồ sơ lộ ra',
      scope: 'Các giá trị đo được phải khớp nhau và khớp cấu hình đã khai báo của chính hồ sơ'
    },
    {
      id: 'pinned-identity',
      label: 'Khớp danh tính đã ghim',
      scope: 'Giá trị đo được so với danh tính đã ghim của chính hồ sơ; chỉ áp dụng khi hồ sơ có danh tính đã ghim'
    },
    {
      id: 'cross-profile-coincidence',
      label: 'Không trùng tín hiệu tránh được với hồ sơ khác',
      scope: 'IP thoát và dải /24 dùng chung, bộ giá trị lộ ra trùng nhau, lệch địa lý — chỉ trong phạm vi LHM quan sát được'
    },
    {
      id: 'network-route',
      label: 'Đường mạng đúng chính sách đã khai báo',
      scope: 'IP thoát đọc từ runtime của hồ sơ, tuyến proxy đã cấu hình, thay đổi IP trong thời gian quan sát'
    },
    {
      id: 'no-unexpected-drift',
      label: 'Không thay đổi ngoài dự kiến trong thời gian quan sát',
      scope: 'Trôi giá trị lộ ra và trôi IP thoát trong khoảng thời gian quan sát đã ghi'
    }
  ];
  const STATUS = {
    pass: { label: 'ĐẠT', className: 'is-pass' },
    fail: { label: 'KHÔNG ĐẠT', className: 'is-fail' },
    unmeasured: { label: 'CHƯA ĐO', className: 'is-unmeasured' }
  };
  const BY_ID = new Map(CRITERIA.map(c => [c.id, c]));

  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  // Mô hình mặc định: trạng thái trung thực khi chưa có dữ liệu đo —
  // tất cả CHƯA ĐO. Đây là dữ liệu thật của khung ở thời điểm hiện tại,
  // không phải dữ liệu mẫu.
  function defaultModel(profileName) {
    return {
      profileName: profileName || null,
      sample: false,
      entries: CRITERIA.map(c => ({
        id: c.id,
        status: 'unmeasured',
        evidence: 'Chưa có dữ liệu đo nối vào khung hiển thị này.',
        observedAt: null,
        method: null,
        limit: 'Chưa thể kết luận về tiêu chí này.',
        nextStep: 'Sau khi ứng dụng nối nguồn dữ liệu đo, mở lại Kiểm tra cấu hình để xem trạng thái theo bằng chứng.'
      }))
    };
  }

  // Mô hình ví dụ: CHỈ để trình diễn bố cục của cả ba trạng thái. Mọi
  // dòng đều ghi rõ là dữ liệu mẫu; không dòng nào là kết quả đo thật
  // và không được dùng để kết luận về bất kỳ hồ sơ nào.
  function exampleModel() {
    const sampleNote = 'Dữ liệu mẫu để trình diễn bố cục — không phải kết quả đo.';
    return {
      profileName: 'Hồ sơ mẫu (không có thật)',
      sample: true,
      entries: [
        {
          id: 'storage-isolation', status: 'pass',
          evidence: sampleNote + ' Ví dụ: dữ liệu đánh dấu ghi vào hồ sơ A không xuất hiện khi đọc từ hồ sơ B.',
          observedAt: 'Ví dụ: 10:02, hôm nay', method: 'Ví dụ: website kiểm thử do LHM kiểm soát',
          limit: sampleNote, nextStep: 'Ví dụ: không cần xử lý.'
        },
        {
          id: 'self-consistency', status: 'fail',
          evidence: sampleNote + ' Ví dụ: múi giờ đo được khác múi giờ đã khai báo trong cấu hình hồ sơ.',
          observedAt: 'Ví dụ: 10:02, hôm nay', method: 'Ví dụ: đọc giá trị runtime của hồ sơ đang chạy',
          limit: sampleNote,
          nextStep: 'Ví dụ: mở hồ sơ, đối chiếu mục múi giờ trong cấu hình với giá trị hiển thị ở đây, sửa cấu hình hoặc đo lại.'
        },
        ...CRITERIA.slice(2).map(c => ({
          id: c.id, status: 'unmeasured',
          evidence: sampleNote + ' Ví dụ: tiêu chí này chưa có phép đo.',
          observedAt: null, method: null,
          limit: sampleNote, nextStep: 'Ví dụ: chưa có bước xử lý.'
        }))
      ]
    };
  }

  function evidenceLine(label, value) {
    const line = node('div', 'criteria-evidence-line');
    line.append(node('strong', '', label + ': '), node('span', '', value));
    return line;
  }

  function renderInto(container, model) {
    if (!container) return;
    container.replaceChildren();
    const entries = new Map();
    for (const entry of (model && model.entries) || []) {
      if (entry && BY_ID.has(entry.id)) entries.set(entry.id, entry);
    }
    const head = node('div', 'criteria-head');
    head.append(node('span', 'criteria-profile',
      model && model.profileName ? 'Hồ sơ: ' + model.profileName : 'Hồ sơ đang chọn trong Kiểm tra cấu hình'));
    container.append(head);
    if (model && model.sample) {
      container.append(node('p', 'criteria-sample-banner',
        'DỮ LIỆU MẪU — chỉ để xem bố cục hiển thị. Đây không phải kết quả đo và không áp dụng cho hồ sơ nào.'));
    }
    container.append(node('p', 'criteria-no-aggregate',
      'Không có kết luận tổng hợp: mỗi tiêu chí dưới đây được đọc riêng theo bằng chứng của nó.'));
    for (const criterion of CRITERIA) {
      const entry = entries.get(criterion.id) || {
        status: 'unmeasured', evidence: 'Chưa có dữ liệu đo cho tiêu chí này.',
        limit: 'Chưa thể kết luận về tiêu chí này.', nextStep: 'Chờ dữ liệu đo được nối vào.'
      };
      const status = STATUS[entry.status] || STATUS.unmeasured;
      const row = node('section', 'criteria-row');
      const rowHead = node('div', 'criteria-row-head');
      const title = node('div', 'criteria-title');
      title.append(node('div', 'criteria-name', criterion.label));
      title.append(node('div', 'criteria-scope', criterion.scope));
      rowHead.append(title, node('span', 'criteria-chip ' + status.className, status.label));
      row.append(rowHead);
      const body = node('div', 'criteria-evidence');
      body.append(evidenceLine('Quan sát', entry.evidence || '—'));
      if (entry.observedAt) body.append(evidenceLine('Thời điểm', entry.observedAt));
      if (entry.method) body.append(evidenceLine('Cách đo', entry.method));
      body.append(evidenceLine('Giới hạn', entry.limit || '—'));
      body.append(evidenceLine('Bước tiếp theo', entry.nextStep || '—'));
      row.append(body);
      container.append(row);
    }
  }

  let currentProfileName = null;
  function showForProfile(profileName) {
    currentProfileName = profileName || null;
    const container = document.getElementById('criteria-checklist');
    if (container) {
      // Điểm nối tích hợp: nếu ứng dụng đã đăng ký nguồn dữ liệu đo tại
      // window.LHMCriteriaChecklistProvider (hàm nhận profileName, trả về
      // model theo hợp đồng ở đầu file), khung dùng model đó. Chưa có
      // provider — hoặc provider lỗi — thì quay về mô hình mặc định toàn
      // CHƯA ĐO; tuyệt đối không suy ra trạng thái từ dữ liệu thiếu.
      let model = null;
      if (typeof window.LHMCriteriaChecklistProvider === 'function') {
        try { model = window.LHMCriteriaChecklistProvider(currentProfileName); }
        catch (error) { model = null; }
      }
      if (model && typeof model.then === 'function') {
        // Provider bất đồng bộ (đường dữ liệu thật qua IPC luôn bất đồng
        // bộ): vẽ mô hình mặc định trong lúc chờ, khi Promise settle thì
        // vẽ lại bằng model thật. Nếu người dùng đã chuyển hồ sơ khác
        // trước khi kết quả về, bỏ kết quả cũ — không vẽ nhầm hồ sơ.
        // Promise bị reject thì giữ nguyên mô hình mặc định đã vẽ.
        renderInto(container, defaultModel(currentProfileName));
        const requestedFor = currentProfileName;
        model.then(resolved => {
          if (currentProfileName !== requestedFor) return;
          renderInto(container, resolved && Array.isArray(resolved.entries)
            ? resolved : defaultModel(currentProfileName));
        }).catch(() => { /* giữ mô hình mặc định toàn CHƯA ĐO đã vẽ */ });
      } else {
        renderInto(container, model && Array.isArray(model.entries) ? model : defaultModel(currentProfileName));
      }
    }
    const live = document.getElementById('criteria-checklist-live');
    if (live) live.hidden = true;
    const sample = document.getElementById('criteria-checklist-sample');
    if (sample) sample.hidden = false;
  }
  function mount() {
    const container = document.getElementById('criteria-checklist');
    if (!container || container.dataset.mounted) return;
    container.dataset.mounted = '1';
    renderInto(container, defaultModel(currentProfileName));
    const sample = document.getElementById('criteria-checklist-sample');
    const live = document.getElementById('criteria-checklist-live');
    if (sample) sample.addEventListener('click', () => {
      renderInto(container, exampleModel());
      sample.hidden = true;
      if (live) live.hidden = false;
    });
    if (live) live.addEventListener('click', () => showForProfile(currentProfileName));
  }

  window.LHMCriteriaChecklist = { CRITERIA, STATUS, defaultModel, exampleModel, renderInto, showForProfile };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
