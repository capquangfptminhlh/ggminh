'use strict';
/*
 * Data provider for the per-criteria checklist (Agent 9 frame,
 * contract in docs/agents/agent-9/INTEGRATION-NOTES.md).
 *
 * Honesty rules (Constitution Sections 16/22/23): an entry carries
 * 'pass' only when a measurement actually ran against THIS profile
 * and met the criterion's acceptance condition; 'fail' only when a
 * measurement/observation found a violation for THIS profile;
 * anything else is an explicit 'unmeasured' entry whose evidence
 * states the concrete reason (missing source, collection error,
 * expired record, record bound to another commit/engine/profile,
 * zero comparable fields). No overall verdict is ever produced.
 *
 * Data sources (all optional; absence degrades to unmeasured):
 *  1. Unified warning report (window.api.getWarningReport):
 *     - network-route + cross-profile-coincidence: D3 exit-IP
 *       warnings (source 'ip-observations') naming this profile.
 *     - no-unexpected-drift: warnings that name this profile and
 *       record an observed change inside the observation window —
 *       Health Drift warnings attributed to the profile (source
 *       'health-drift'; today's implementation emits fleet-level
 *       warnings with an empty profile list, so this branch is
 *       future-proofing) and D3 mid-session IP change / unstable
 *       egress warnings (codes ip_changed_mid_session,
 *       egress_unstable). Fleet-level Health Drift output alone
 *       NEVER passes or fails an individual profile: the drift
 *       source aggregates configuration-health rates across the
 *       fleet and does not measure this profile's exposed-value
 *       drift, so 'ok + no warnings' maps to unmeasured with the
 *       reason stated, per Section 16 (a pass requires the
 *       criterion's own test to have run for this profile).
 *  2. Per-profile measurement record (format
 *     'lhm-profile-measurement' v1, contract in INTEGRATION-NOTES):
 *     feeds storage-isolation, self-consistency and
 *     pinned-identity from stage0-style configured/isolation
 *     measurements OF THIS PROFILE. Records are bound per
 *     Section 23 (app commit, engine hash, OS, time, tier) and
 *     expire after RECORD_MAX_AGE_MS; a record for synthetic
 *     stage0 profiles must never be imported under a real
 *     profile's id (the producer's duty — the provider can only
 *     check the bindings it is given).
 *
 * Injection seam for tests:
 * if window.LHMCriteriaChecklistDataSource is a function, the
 * provider awaits it with the profileId and uses its return value
 * { profileName?, profile?, warningReport?, measurementRecord?,
 *   currentContext?: { appCommit?, engineSha256? } }.
 * Otherwise it falls back to window.api: getProfiles +
 * getWarningReport for the warning-fed criteria, and — since the
 * R15 wiring — getProfileMeasurement(profileId) for the measurement
 * record plus the running app's currentContext, so the validity
 * gate below can actually evaluate commit/engine bindings. When
 * the preload predates that method, the three stage0 criteria stay
 * unmeasured with the not-wired reason stated.
 */
(function () {
  const ROUTE_CODES = ['ip_changed_mid_session', 'egress_unstable'];
  const COINCIDENCE_CODES = ['shared_exit_ip', 'subnet_concentration', 'subnet_overlap'];

  const RECORD_FORMAT = 'lhm-profile-measurement';
  const RECORD_VERSION = 1;
  // Section 23: results need an expiry condition. A measurement
  // record is accepted for at most 30 days; engine, configuration,
  // proxy or environment changes invalidate it sooner — the
  // commit/engine bindings below cover the cases the provider can
  // actually check. Coordinator/owner may tighten this constant.
  const RECORD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  // Section 23: results from one tier are not evidence for another.
  // The checklist is an acceptance surface, so only records from a
  // real engine (direct launch) or the installed EXE count.
  const RECORD_ACCEPTED_TIERS = ['real-engine', 'installed-exe'];
  const ISOLATION_CONDITIONS = ['baselineClassic', 'concurrentCrossWrite',
    'crashRecovery', 'crashRecoveryIdleFlush', 'httpCache', 'faviconCache'];

  function unmeasured(id, evidence, limit, nextStep) {
    return {
      id, status: 'unmeasured', evidence,
      observedAt: '', method: '',
      limit: limit || 'Chưa thể kết luận về tiêu chí này.',
      nextStep: nextStep || '',
    };
  }

  function warningToEntry(id, w) {
    return {
      id, status: 'fail',
      evidence: w.observed.summary || w.title,
      observedAt: w.lastDetectedAt || w.evaluatedAt || '',
      method: w.method || '',
      limit: w.limitation || '',
      nextStep: (w.nextSteps && w.nextSteps[0]) || '',
    };
  }

  function warningsForProfile(report, profileId) {
    return (report.warnings || []).filter(w =>
      w && w.observed && Array.isArray(w.observed.profiles) &&
      w.observed.profiles.includes(profileId));
  }

  // --- network-route + cross-profile-coincidence (existing) ------
  function ipEntriesFor(report, profileId) {
    const entries = [];
    if (!report || !report.sources) return entries;
    const d3 = report.sources.ipWarnings;
    const ipMeasured = d3 && d3.status === 'ok';
    if (!ipMeasured) return entries;
    const runtimeProfiles = Array.isArray(d3.runtimeProfiles) ? d3.runtimeProfiles : [];
    const runtimeMeasured = runtimeProfiles.includes(profileId);
    const mine = warningsForProfile(report, profileId)
      .filter(w => w.source === 'ip-observations');
    const runtimeMine = mine.filter(w =>
      w.observed && w.observed.values &&
      w.observed.values.measurementSource === 'browser-runtime');
    const runtimeRoute = runtimeMine.find(w => ROUTE_CODES.includes(w.code));
    if (runtimeRoute) {
      const route = runtimeRoute;
      entries.push(warningToEntry('network-route', route));
    } else if (runtimeMeasured) {
      entries.push({
        id: 'network-route', status: 'pass',
        evidence: 'Khong co canh bao IP thoat nao cho ho so nay trong lan danh gia gan nhat',
        observedAt: report.evaluatedAt || '',
        method: 'Dich vu canh bao thong nhat (D3) tren quan sat IP thoat da ghi',
        limit: 'Chi dua tren cac quan sat IP thoat ung dung da ghi lai; khong bao gom DNS/WebRTC (chua do).',
        nextStep: '',
      });
    } else {
      const managerProfiles = Array.isArray(d3.managerProfiles) ? d3.managerProfiles : [];
      const managerObserved = managerProfiles.includes(profileId);
      entries.push(unmeasured('network-route',
        managerObserved
          ? 'Chỉ có quan sát IP từ tiến trình quản lý cho hồ sơ này; chưa có phép đo trong runtime trình duyệt.'
          : 'Chưa có quan sát IP thoát trong runtime trình duyệt cho hồ sơ này.',
        'Quan sát của tiến trình quản lý không thay thế phép đo trong runtime hồ sơ; DNS và WebRTC cũng chưa được suy ra từ phép đo IP.',
        'Cấu hình endpoint HTTPS được phép rồi chạy lại phép đo IP từ chính runtime hồ sơ.'));
    }
    const shared = mine.find(w => COINCIDENCE_CODES.includes(w.code));
    if (shared) entries.push(warningToEntry('cross-profile-coincidence', shared));
    return entries;
  }

  // --- no-unexpected-drift ----------------------------------------
  function driftEntriesFor(report, profileId) {
    const id = 'no-unexpected-drift';
    if (!report || !report.sources) {
      return [unmeasured(id,
        'Không đọc được báo cáo cảnh báo thống nhất (lỗi thu thập) nên không có quan sát trôi nào cho hồ sơ này.',
        'Thiếu dữ liệu không phải là bằng chứng không có thay đổi.',
        'Mở lại Kiểm tra cấu hình sau khi dịch vụ cảnh báo chạy được.')];
    }
    // Attributable observed change inside the window => fail.
    const attributable = warningsForProfile(report, profileId).filter(w =>
      w.source === 'health-drift' ||
      (w.source === 'ip-observations' && ROUTE_CODES.includes(w.code)));
    if (attributable.length) {
      const entry = warningToEntry(id, attributable[0]);
      if (attributable.length > 1) {
        entry.evidence += ' (1 trong ' + attributable.length +
          ' cảnh báo thay đổi quan sát được gắn với hồ sơ này.)';
      }
      return [entry];
    }
    const src = report.sources.healthDrift;
    if (!src) {
      return [unmeasured(id,
        'Báo cáo cảnh báo không chứa nguồn Health Drift.',
        'Chưa thể kết luận về tiêu chí này.',
        'Kiểm tra dịch vụ cảnh báo và nguồn Health Drift trong ứng dụng.')];
    }
    if (src.status === 'not_measured') {
      return [unmeasured(id,
        'Nguồn Health Drift chưa đo được: ' + (src.reason || 'chưa đủ dữ liệu.'),
        'Chưa có cửa sổ snapshot nào được so sánh cho tiêu chí này.',
        'Để ứng dụng chạy và lưu thêm snapshot sức khỏe, sau đó đánh giá lại.')];
    }
    if (src.status === 'error') {
      return [unmeasured(id,
        'Nguồn Health Drift lỗi khi đánh giá: ' + (src.reason || 'không rõ nguyên nhân.'),
        'Lỗi thu thập dữ liệu không được chuyển thành đạt hay không đạt (Mục 16).',
        'Kiểm tra dữ liệu snapshot sức khỏe rồi đánh giá lại.')];
    }
    // src.status === 'ok'
    const fleetDrift = (report.warnings || [])
      .filter(w => w && w.source === 'health-drift');
    if (fleetDrift.length) {
      const w = fleetDrift[0];
      return [unmeasured(id,
        'Có cảnh báo trôi ở mức toàn đội hồ sơ: ' +
          ((w.observed && w.observed.summary) || w.title || w.code) +
          ' Cảnh báo này không gắn với hồ sơ cụ thể nào nên không quy được cho hồ sơ này.',
        'Cảnh báo gộp toàn đội không phải phép đo trên hồ sơ này; không suy ra đạt hay không đạt cho từng hồ sơ (Mục 16).',
        'Đo lại hồ sơ này bằng phép đo có cấu hình để kết luận theo hồ sơ, hoặc chờ nguồn trôi gắn được theo hồ sơ.')];
    }
    return [unmeasured(id,
      'Lần đánh giá gần nhất: nguồn Health Drift đã đo' +
        (src.driftStatus ? ' (trạng thái gộp: ' + src.driftStatus + ')' : '') +
        ' và không có cảnh báo trôi nào, kể cả ở mức toàn đội hồ sơ.',
      'Health Drift hiện đo tỉ lệ lỗi/cảnh báo cấu hình gộp toàn đội qua các cửa sổ snapshot — không phải phép đo trôi giá trị lộ ra của riêng hồ sơ này. Theo Mục 16, trạng thái đạt cần phép thử của chính tiêu chí đã chạy trên hồ sơ, nên chưa suy ra đạt từ dữ liệu gộp.',
      'Đo hồ sơ ở hai thời điểm bằng phép đo có cấu hình (stage0) để có bằng chứng trôi theo hồ sơ.')];
  }

  // --- measurement record: validity gate (Section 23) -------------
  // Returns { record } when usable, otherwise { reason } with the
  // concrete cause every stage0-fed criterion must report.
  function checkRecord(record, profileId, currentContext, sourceWired) {
    if (!record) {
      return { reason: sourceWired
        ? 'Nguồn hồ sơ đo không có bản ghi nào cho hồ sơ này.'
        : 'Ứng dụng chưa nối nguồn hồ sơ đo stage0 vào bảng kiểm, nên chưa có bản ghi đo nào cho hồ sơ này.' };
    }
    if (typeof record !== 'object' || Array.isArray(record)) {
      return { reason: 'Hồ sơ đo không phải một đối tượng JSON hợp lệ.' };
    }
    if (record.format !== RECORD_FORMAT || record.version !== RECORD_VERSION) {
      return { reason: 'Hồ sơ đo không đúng định dạng ' + RECORD_FORMAT +
        ' v' + RECORD_VERSION + ' (format=' + String(record.format) +
        ', version=' + String(record.version) + ').' };
    }
    if (record.profileId !== profileId) {
      return { reason: 'Hồ sơ đo thuộc về hồ sơ khác (' +
        String(record.profileId) + '), không dùng làm bằng chứng cho hồ sơ này.' };
    }
    const measuredAtMs = Date.parse(record.measuredAt);
    if (!Number.isFinite(measuredAtMs)) {
      return { reason: 'Hồ sơ đo thiếu thời điểm đo hợp lệ (measuredAt).' };
    }
    if (Date.now() - measuredAtMs > RECORD_MAX_AGE_MS) {
      return { reason: 'Hồ sơ đo đã quá hạn ' +
        Math.round(RECORD_MAX_AGE_MS / 86400000) + ' ngày (đo lúc ' +
        record.measuredAt + '); kết quả cũ phải đo lại khi quá hạn (Mục 23).' };
    }
    if (!RECORD_ACCEPTED_TIERS.includes(record.tier)) {
      return { reason: 'Hồ sơ đo ở tầng "' + String(record.tier) +
        '" — kết quả tầng mô phỏng/tích hợp không dùng làm bằng chứng nghiệm thu cho tầng engine thật (Mục 23).' };
    }
    if (typeof record.appCommit !== 'string' || !record.appCommit) {
      return { reason: 'Hồ sơ đo không gắn commit ứng dụng (Mục 23 yêu cầu mọi kết quả đo gắn với commit).' };
    }
    if (!record.engine || typeof record.engine.sha256 !== 'string' || !record.engine.sha256) {
      return { reason: 'Hồ sơ đo không gắn hash của engine đã đo (Mục 23).' };
    }
    if (currentContext) {
      if (currentContext.appCommit && currentContext.appCommit !== record.appCommit) {
        return { reason: 'Hồ sơ đo gắn với commit ứng dụng khác (' +
          record.appCommit + ') so với bản đang chạy — cấu hình/hành vi có thể đã khác, cần đo lại.' };
      }
      if (currentContext.engineSha256 && currentContext.engineSha256 !== record.engine.sha256) {
        return { reason: 'Hồ sơ đo gắn với engine khác (hash ' +
          record.engine.sha256 + ') so với engine hiện tại — cần đo lại trên engine hiện tại.' };
      }
    }
    return { record };
  }

  function recordLimit(record, currentContext) {
    const parts = ['Kết quả chỉ phủ phạm vi và thời điểm của lần đo ghi trong hồ sơ đo' +
      ' (commit ' + record.appCommit + ', engine ' +
      ((record.engine && record.engine.version) || 'không rõ phiên bản') + ').'];
    if (!currentContext) {
      parts.push('Chưa đối chiếu được commit/engine hiện tại từ ứng dụng.');
    }
    return parts.join(' ');
  }

  function recordMethod(record, fallback) {
    return record.method || fallback;
  }

  // --- storage-isolation -------------------------------------------
  function isolationEntry(record, ctx) {
    const id = 'storage-isolation';
    const iso = record.results && record.results.isolation;
    if (!iso || typeof iso !== 'object') {
      return unmeasured(id,
        'Hồ sơ đo không chứa kết quả cách ly lưu trữ.',
        ctx.limit, 'Chạy phép thử cách ly (stage0 run-isolation) cho hồ sơ này cùng một hồ sơ khác rồi nhập kết quả.');
    }
    if (iso.status !== 'measured') {
      return unmeasured(id,
        'Phép thử cách ly không hoàn thành: ' + (iso.reason || 'không rõ nguyên nhân (lỗi thu thập).'),
        'Lỗi thu thập dữ liệu không được chuyển thành đạt (Mục 16).',
        'Chạy lại phép thử cách ly và nhập kết quả mới.');
    }
    const conditions = (iso.conditions && typeof iso.conditions === 'object') ? iso.conditions : {};
    const ran = ISOLATION_CONDITIONS.filter(k => conditions[k] === 'pass' || conditions[k] === 'fail');
    const failed = ISOLATION_CONDITIONS.filter(k => conditions[k] === 'fail');
    const notRun = ISOLATION_CONDITIONS.filter(k => conditions[k] !== 'pass' && conditions[k] !== 'fail');
    const pairNote = typeof iso.pairedProfileId === 'string' && iso.pairedProfileId
      ? ' (đo theo cặp với hồ sơ ' + iso.pairedProfileId + ')' : '';
    if (failed.length) {
      return {
        id, status: 'fail',
        evidence: 'Phép thử cách ly' + pairNote + ' phát hiện vi phạm ở: ' +
          failed.join(', ') + '. Đã chạy ' + ran.length + '/' + ISOLATION_CONDITIONS.length +
          ' điều kiện, đạt ' + (ran.length - failed.length) + ', không đạt ' + failed.length + '.',
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Phép thử cách ly lưu trữ stage0 (marker tổng hợp, origin kiểm soát)'),
        limit: ctx.limit + (notRun.length ? ' Chưa chạy: ' + notRun.join(', ') + '.' : ''),
        nextStep: 'Kiểm tra điều kiện không đạt trong báo cáo phép thử cách ly, sửa cấu hình/hồ sơ rồi đo lại.',
      };
    }
    if (conditions.baselineClassic === 'pass' && conditions.concurrentCrossWrite === 'pass') {
      return {
        id, status: 'pass',
        evidence: 'Phép thử cách ly' + pairNote + ' đã chạy ' + ran.length + '/' +
          ISOLATION_CONDITIONS.length + ' điều kiện (' + ran.join(', ') +
          '), tất cả đều đạt — gồm cách ly nền và ghi đồng thời/ghi chéo.',
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Phép thử cách ly lưu trữ stage0 (marker tổng hợp, origin kiểm soát)'),
        limit: ctx.limit + (notRun.length
          ? ' Trạng thái đạt chỉ phủ các điều kiện đã chạy; chưa chạy: ' + notRun.join(', ') + '.'
          : ''),
        nextStep: '',
      };
    }
    return unmeasured(id,
      'Kết quả cách ly chưa đủ điều kiện kết luận: baselineClassic=' +
        String(conditions.baselineClassic || 'not_run') + ', concurrentCrossWrite=' +
        String(conditions.concurrentCrossWrite || 'not_run') +
        ' — cần cả hai điều kiện nền đạt mới kết luận được.',
      ctx.limit, 'Chạy đủ phép thử cách ly nền và ghi đồng thời cho cặp hồ sơ này.');
  }

  // --- self-consistency + pinned-identity ---------------------------
  function configuredEntries(record, ctx, profile) {
    const entries = [];
    const cfg = record.results && record.results.configured;
    const baseLimit = ctx.limit;

    // pinned-identity first: it does not apply to profiles that have
    // no pinned identity, whatever any record claims.
    const hasIdentity = !!(profile && profile.fingerprint && profile.fingerprint.identity);
    const profileKnown = !!profile;
    let pinnedEntry = null;
    if (profileKnown && !hasIdentity) {
      pinnedEntry = unmeasured('pinned-identity',
        'Hồ sơ này chưa có danh tính đã ghim' +
          (profile.fingerprint && profile.fingerprint.identityProvisioning === 'unavailable'
            ? ' (lúc tạo hồ sơ, sinh danh tính không khả dụng)' : '') +
          ' — tiêu chí chỉ áp dụng khi hồ sơ có danh tính đã ghim.',
        'Không có danh tính đã ghim thì không có kỳ vọng để đối chiếu.',
        'Tạo lại hồ sơ khi engine/generator khả dụng, hoặc cấp danh tính cho hồ sơ rồi đo lại.');
    }

    if (!cfg || typeof cfg !== 'object') {
      entries.push(unmeasured('self-consistency',
        'Hồ sơ đo không chứa kết quả đo có cấu hình (run-config).',
        baseLimit, 'Chạy phép đo có cấu hình cho hồ sơ này rồi nhập kết quả.'));
      entries.push(pinnedEntry || unmeasured('pinned-identity',
        'Hồ sơ đo không chứa kết quả đo có cấu hình (run-config).',
        baseLimit, 'Chạy phép đo có cấu hình cho hồ sơ này rồi nhập kết quả.'));
      return entries;
    }
    if (cfg.status !== 'measured') {
      const reason = 'Phép đo có cấu hình không hoàn thành: ' +
        (cfg.reason || 'không rõ nguyên nhân (lỗi thu thập).');
      entries.push(unmeasured('self-consistency', reason,
        'Lỗi thu thập dữ liệu không được chuyển thành đạt (Mục 16).',
        'Chạy lại phép đo có cấu hình và nhập kết quả mới.'));
      entries.push(pinnedEntry || unmeasured('pinned-identity', reason,
        'Lỗi thu thập dữ liệu không được chuyển thành đạt (Mục 16).',
        'Chạy lại phép đo có cấu hình và nhập kết quả mới.'));
      return entries;
    }

    // self-consistency from the same configured run
    const cons = (cfg.consistency && typeof cfg.consistency === 'object') ? cfg.consistency : null;
    if (!cons) {
      entries.push(unmeasured('self-consistency',
        'Kết quả đo có cấu hình không chứa khối tự nhất quán.',
        baseLimit, 'Bổ sung khối tự nhất quán vào hồ sơ đo (xem hợp đồng trong INTEGRATION-NOTES).'));
    } else if (!Number.isInteger(cons.checked) || cons.checked <= 0) {
      entries.push(unmeasured('self-consistency',
        'Phép đo có cấu hình kiểm 0 điểm nhất quán — không có trường nào so được.',
        baseLimit, 'Đo lại với đầu đo mở rộng để có điểm nhất quán so được.'));
    } else if (Array.isArray(cons.inconsistent) && cons.inconsistent.length) {
      const listed = cons.inconsistent.slice(0, 4)
        .map(x => (x && x.point ? x.point : '?') + ((x && x.summary) ? ': ' + x.summary : ''))
        .join('; ');
      entries.push({
        id: 'self-consistency', status: 'fail',
        evidence: 'Phép đo có cấu hình phát hiện ' + cons.inconsistent.length +
          ' điểm không nhất quán trong ' + cons.checked + ' điểm đã kiểm: ' + listed + '.',
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Đo runtime có cấu hình (stage0 run-config) đối chiếu cấu hình đã khai'),
        limit: baseLimit,
        nextStep: 'Đối chiếu từng điểm không nhất quán với cấu hình đã khai của hồ sơ, sửa cấu hình hoặc đo lại.',
      });
    } else {
      entries.push({
        id: 'self-consistency', status: 'pass',
        evidence: 'Phép đo có cấu hình đã kiểm ' + cons.checked +
          ' điểm nhất quán của các giá trị lộ ra so với cấu hình đã khai của chính hồ sơ; không điểm nào mâu thuẫn.',
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Đo runtime có cấu hình (stage0 run-config) đối chiếu cấu hình đã khai'),
        limit: baseLimit,
        nextStep: '',
      });
    }

    // pinned-identity from the expectation comparison of the same run
    if (pinnedEntry) { entries.push(pinnedEntry); return entries; }
    const ident = (cfg.identity && typeof cfg.identity === 'object') ? cfg.identity : null;
    if (!ident) {
      entries.push(unmeasured('pinned-identity',
        'Kết quả đo có cấu hình không chứa khối so kỳ vọng danh tính.',
        baseLimit, 'Bổ sung khối so kỳ vọng danh tính vào hồ sơ đo (xem hợp đồng trong INTEGRATION-NOTES).'));
      return entries;
    }
    if (!Number.isInteger(ident.compared) || ident.compared <= 0) {
      entries.push(unmeasured('pinned-identity',
        'Phép đo có cấu hình so 0 trường danh tính — không có trường nào so được với kỳ vọng trong blob đã ghim.',
        baseLimit, 'Đo lại khi đầu đo đọc được các trường danh tính của hồ sơ.'));
      return entries;
    }
    const mismatches = Array.isArray(ident.mismatches) ? ident.mismatches : [];
    if (Number.isInteger(ident.matched) && ident.matched === ident.compared && mismatches.length === 0) {
      entries.push({
        id: 'pinned-identity', status: 'pass',
        evidence: 'Giá trị lộ ra khớp ' + ident.matched + '/' + ident.compared +
          ' trường danh tính so được với kỳ vọng trong blob đã ghim của chính hồ sơ.',
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Đo runtime có cấu hình (stage0 run-config), so kỳ vọng từ blob danh tính đã ghim'),
        limit: baseLimit + ' Chỉ các trường so được mới được tính; trường không có đầu đo không nằm trong tỉ lệ này.',
        nextStep: '',
      });
    } else {
      const listed = mismatches.slice(0, 4).map(x => {
        if (!x || typeof x !== 'object') return '?';
        return String(x.field || '?') + ' (kỳ vọng ' + String(x.expected) +
          ', lộ ra ' + String(x.observed) + ')';
      }).join('; ');
      entries.push({
        id: 'pinned-identity', status: 'fail',
        evidence: 'Giá trị lộ ra chỉ khớp ' +
          (Number.isInteger(ident.matched) ? ident.matched : '?') + '/' + ident.compared +
          ' trường danh tính so được' + (listed ? ': lệch ở ' + listed + '.' : '.'),
        observedAt: record.measuredAt || '',
        method: recordMethod(record, 'Đo runtime có cấu hình (stage0 run-config), so kỳ vọng từ blob danh tính đã ghim'),
        limit: baseLimit,
        nextStep: 'Đối chiếu các trường lệch với blob danh tính đã ghim; sinh lại danh tính hoặc sửa cấu hình hồ sơ rồi đo lại.',
      });
    }
    return entries;
  }

  function measurementEntries(record, check, profile, currentContext) {
    if (!check.record) {
      const reason = check.reason;
      const mk = (id) => unmeasured(id, reason,
        'Chưa có bằng chứng đo đủ điều kiện cho tiêu chí này.',
        'Chạy phép đo cho hồ sơ này và nhập hồ sơ đo theo hợp đồng (INTEGRATION-NOTES).');
      const entries = [mk('storage-isolation'), mk('self-consistency')];
      if (profile && !(profile.fingerprint && profile.fingerprint.identity)) {
        // The more fundamental reason wins: with no pinned identity
        // the criterion does not apply to this profile at all.
        entries.push(unmeasured('pinned-identity',
          'Hồ sơ này chưa có danh tính đã ghim — tiêu chí chỉ áp dụng khi hồ sơ có danh tính đã ghim.',
          'Không có danh tính đã ghim thì không có kỳ vọng để đối chiếu.',
          'Tạo lại hồ sơ khi engine/generator khả dụng, hoặc cấp danh tính cho hồ sơ rồi đo lại.'));
      } else {
        entries.push(mk('pinned-identity'));
      }
      return entries;
    }
    const ctx = { limit: recordLimit(record, currentContext) };
    return [
      isolationEntry(record, ctx),
      ...configuredEntries(record, ctx, profile),
    ];
  }

  // --- data loading --------------------------------------------------
  async function loadData(profileId) {
    if (typeof window.LHMCriteriaChecklistDataSource === 'function') {
      const d = await window.LHMCriteriaChecklistDataSource(profileId);
      if (d && typeof d === 'object') {
        return {
          profileName: d.profileName || '',
          profile: d.profile || null,
          warningReport: d.warningReport || null,
          measurementRecord: d.measurementRecord || null,
          currentContext: d.currentContext || null,
          recordSourceWired: true,
        };
      }
      return { profileName: '', profile: null, warningReport: null,
        measurementRecord: null, currentContext: null, recordSourceWired: true };
    }
    let profileName = '';
    let profile = null;
    try {
      const profiles = await window.api.getProfiles();
      const found = (profiles || []).find(p => p.id === profileId);
      if (found) { profileName = found.name || ''; profile = found; }
    } catch (_) { /* name/profile are inputs, not verdicts */ }
    let report = null;
    try { report = await window.api.getWarningReport(); } catch (_) { report = null; }
    // Measurement record + current context (R15): the main process
    // serves the stored record for THIS profile together with the
    // running build's commit and the installed engine's hash, which
    // is what lets checkRecord enforce the Section-23 bindings
    // instead of merely noting them. The method's presence is what
    // marks the source wired; a failed call degrades to "no record"
    // (an input problem, never a verdict).
    let measurementRecord = null;
    let currentContext = null;
    let recordSourceWired = false;
    try {
      if (window.api && typeof window.api.getProfileMeasurement === 'function') {
        recordSourceWired = true;
        const m = await window.api.getProfileMeasurement(profileId);
        if (m && typeof m === 'object') {
          measurementRecord = m.record || null;
          currentContext = m.currentContext || null;
        }
      }
    } catch (_) { /* measurement source is an input, not a verdict */ }
    return { profileName, profile, warningReport: report,
      measurementRecord, currentContext, recordSourceWired };
  }

  window.LHMCriteriaChecklistProvider = async (profileId) => {
    const data = await loadData(profileId);
    const check = checkRecord(data.measurementRecord, profileId,
      data.currentContext, data.recordSourceWired);
    return {
      profileName: data.profileName,
      sample: false,
      entries: [
        ...ipEntriesFor(data.warningReport, profileId),
        ...driftEntriesFor(data.warningReport, profileId),
        ...measurementEntries(data.measurementRecord, check, data.profile, data.currentContext),
      ],
    };
  };

  // Exposed for tests and for the coordinator's importer tooling:
  // the record contract constants and the pure mapping helpers.
  window.LHMCriteriaChecklistProviderContract = {
    RECORD_FORMAT, RECORD_VERSION, RECORD_MAX_AGE_MS,
    RECORD_ACCEPTED_TIERS, ISOLATION_CONDITIONS,
    checkRecord, driftEntriesFor, ipEntriesFor, measurementEntries,
  };
})();
