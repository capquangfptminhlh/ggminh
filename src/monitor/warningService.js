'use strict';
/**
 * Warning service — the operational-warning layer of the Linkage Guard
 * (Hiến pháp Mục 6). It runs the existing analysis modules over REAL
 * application data and normalises every warning into the six-question
 * evidence format of Mục 22:
 *   (1) what was observed; (2) which profile/session; (3) when and how;
 *   (4) compared against which configuration/criterion; (5) limits of
 *   the conclusion; (6) what the user can check or do next.
 *
 * Inputs are dependency-injected so the service is testable without the
 * application, and so main.js wiring stays a few lines (see
 * docs/agent-8/INTEGRATION-NOTES.md):
 *   - behaviorEvents: BehaviorMonitor events ({action, profileId, source,
 *     at}) — analysed by behaviorPatterns (D2).
 *   - ipObservations: the app's own exit-IP observations ({profileId, ip,
 *     observedAt, sessionId?}) — analysed by autoIpWarnings (D3).
 *   - healthDrift: a LocalHealthDrift report(), a detectDrift() result,
 *     or a raw snapshots array — normalised from localDrift.
 *   - monitorAlerts (optional): BehaviorMonitor#getReport().alerts, which
 *     already reach the UI today; normalised into the same format so one
 *     feed can carry every warning.
 *
 * Discipline (Mục 16, 19.2, 20.2, 20.3, 22):
 *   - A missing source is reported as not_measured with a reason — never
 *     silently treated as "normal". A malformed source is an error, and
 *     an error is never converted into a pass.
 *   - Warnings describe observed patterns only. They never claim a
 *     platform links profiles or will act on an account.
 *   - Only the bounded event/observation shapes above are consumed; the
 *     underlying normalisers project fixed field sets, so no keystroke
 *     content, passwords, clipboard, form content or page data can flow
 *     through this service.
 */
const { behaviorPatternWarnings, normalizeEvents } =
  require('./behaviorPatterns');
const { automaticIpWarnings, normalizeObservations } =
  require('../health/autoIpWarnings');
const { detectDrift } = require('../health/localDrift');
const { GraphDefense } = require('../health/GraphDefense');

const LEVELS = { high: 3, medium: 2, notice: 1 };
const DRIFT_STATUSES = new Set(['insufficient', 'stable', 'review', 'investigate']);

const TITLES = {
  synchronized_open_burst: 'Nhiều hồ sơ mở gần như đồng thời',
  identical_sequence: 'Hai hồ sơ lặp lại cùng chuỗi thao tác',
  bulk_open_close: 'Mở/đóng hồ sơ hàng loạt trong 10 phút',
  regular_interval_open: 'Một hồ sơ mở theo nhịp gần như không đổi',
  shared_exit_ip: 'Nhiều hồ sơ dùng chung một IP thoát',
  subnet_concentration: 'Nhiều hồ sơ tập trung trên cùng một /24',
  subnet_overlap: 'Thời gian sử dụng chồng lấp trên cùng một /24',
  ip_changed_mid_session: 'IP thoát thay đổi trong một phiên ứng dụng',
  egress_unstable: 'Một hồ sơ xuất hiện trên nhiều IP thoát',
  drift_error_rate_increase: 'Tỉ lệ hồ sơ lỗi cấu hình tăng',
  drift_warning_rate_increase: 'Tỉ lệ hồ sơ cảnh báo cấu hình tăng',
  drift_app_version_changed: 'Phiên bản ứng dụng thay đổi giữa các lần đo',
  repeat_api_open: 'API liên tục yêu cầu mở cùng một hồ sơ',
  repeat_open: 'Một hồ sơ bị yêu cầu mở nhiều lần',
  rapid_cycle: 'Mở/đóng cùng một hồ sơ liên tục',
  repeat_update: 'Một hồ sơ được chỉnh sửa liên tiếp nhiều lần',
  bulk_open: 'Số yêu cầu mở hồ sơ tăng cao trên toàn ứng dụng',
};

const METHODS = {
  'behavior-patterns':
    'Phân tích sự kiện thao tác trong ứng dụng do BehaviorMonitor ghi ' +
    '(chỉ các thao tác mở/đóng/lưu/xóa hồ sơ; không có nội dung trang ' +
    'web, phím gõ hay thông tin đăng nhập).',
  'ip-observations':
    'Đối chiếu các quan sát IP thoát do ứng dụng ghi lại (mỗi quan sát: ' +
    'hồ sơ, địa chỉ IPv4 công khai, thời điểm, phiên ứng dụng).',
  'health-drift':
    'So sánh số đếm tổng hợp cấu hình cục bộ giữa các snapshot sức khỏe ' +
    'do người dùng lưu (LocalHealthDrift/detectDrift).',
  'behavior-monitor':
    'BehaviorMonitor tổng hợp thao tác trong ứng dụng ở cửa sổ 10 phút ' +
    'gần nhất.',
};

const CRITERIA = {
  synchronized_open_burst:
    'Ngưỡng mẫu D2: từ 3 hồ sơ khác nhau được mở trong cửa sổ 60 giây.',
  identical_sequence:
    'Ngưỡng mẫu D2: cùng một chuỗi 3 thao tác liên tiếp xuất hiện ở hai ' +
    'hồ sơ trong cửa sổ 10 phút.',
  bulk_open_close:
    'Ngưỡng mẫu D2: từ 8 lần mở và 8 lần đóng hồ sơ trong cửa sổ 10 phút ' +
    'trên toàn ứng dụng.',
  regular_interval_open:
    'Ngưỡng mẫu D2: một hồ sơ được mở từ 4 lần với hệ số biến thiên của ' +
    'khoảng cách giữa các lần mở dưới 0,1.',
  shared_exit_ip:
    'Chính sách vận hành: mỗi hồ sơ nên dùng IP thoát riêng; IP thoát ' +
    'dùng chung là tài nguyên mạng dùng chung quan sát được (Mục 19).',
  subnet_concentration:
    'GraphDefense: nhiều hồ sơ quản lý cùng tập trung trên một /24 theo ' +
    'quan sát IP thoát mới nhất của mỗi hồ sơ.',
  subnet_overlap:
    'GraphDefense: khoảng thời gian sử dụng của hai hồ sơ chồng lấp trên ' +
    'cùng một /24 theo thời gian quan sát.',
  ip_changed_mid_session:
    'IP thoát của một hồ sơ phải ổn định trong một phiên ứng dụng; thay ' +
    'đổi giữa phiên cho thấy tuyến proxy có thể đã đổi hoặc rớt.',
  egress_unstable:
    'Ngưỡng mẫu D3: một hồ sơ được quan sát trên từ 4 IP thoát khác nhau.',
  drift_error_rate_increase:
    'detectDrift: tỉ lệ hồ sơ lỗi cấu hình ở 3 snapshot gần nhất tăng từ ' +
    '0,20 so với cửa sổ snapshot trước.',
  drift_warning_rate_increase:
    'detectDrift: tỉ lệ hồ sơ cảnh báo cấu hình ở 3 snapshot gần nhất ' +
    'tăng từ 0,30 so với cửa sổ snapshot trước.',
  drift_app_version_changed:
    'Mục 23: kết quả đo cũ có điều kiện hết hiệu lực khi phiên bản ứng ' +
    'dụng thay đổi và cần đo lại.',
};

const LIMITATIONS = {
  'behavior-patterns':
    'Cảnh báo chỉ mô tả mẫu thao tác quan sát được trong ứng dụng. Đây ' +
    'không phải bằng chứng các hồ sơ do cùng một người vận hành, không ' +
    'kết luận nền tảng sẽ xử lý tài khoản, và mẫu này cũng có thể xuất ' +
    'phát từ quy trình vận hành hợp lệ (Mục 20.2).',
  'ip-observations':
    'Cảnh báo mô tả quan sát mạng của chính ứng dụng. Cùng IP thoát ' +
    'hoặc cùng /24 không chứng minh các hồ sơ do cùng một người dùng, ' +
    'và không kết luận nền tảng đã liên kết các hồ sơ (Mục 19.2).',
  'health-drift':
    'Chỉ so sánh số đếm tổng hợp cấu hình cục bộ giữa hai cửa sổ ' +
    'snapshot; dữ liệu không chứa IP, định danh hay dữ liệu duyệt web ' +
    'và không nói gì về hệ thống bên ngoài.',
  'behavior-monitor':
    'Chỉ dựa trên thao tác trong ứng dụng ở 10 phút gần nhất; ứng dụng ' +
    'không quan sát thao tác trên trang web (Mục 20.1).',
};

const NEXT_STEPS = {
  shared_exit_ip: [
    'Mở Proxy Center và kiểm tra proxy đang gán cho từng hồ sơ kể trên.',
    'Gán mỗi hồ sơ một IP thoát riêng rồi đo lại IP thoát trước khi chạy các hồ sơ đồng thời.',
  ],
  subnet_concentration: [
    'Kiểm tra dải IP của các proxy đang gán; tránh tập trung nhiều hồ sơ trên cùng một /24 nếu không có lý do vận hành.',
    'Đo lại IP thoát sau khi đổi proxy để có quan sát mới đối chiếu.',
  ],
  subnet_overlap: [
    'Kiểm tra các proxy thuộc cùng /24 đang gán cho các hồ sơ và thời gian sử dụng của chúng.',
    'Đo lại sau khi đổi proxy hoặc thay đổi lịch sử dụng.',
  ],
  ip_changed_mid_session: [
    'Kiểm tra độ ổn định của proxy của hồ sơ trong phiên đó (rớt tuyến, tự đổi cổng ra).',
    'Chỉ biết IP khác nhau giữa hai lần đo; thời điểm thay đổi chính xác chưa xác định được.',
  ],
  egress_unstable: [
    'Kiểm tra proxy của hồ sơ có đang xoay IP không; nếu có, cân nhắc proxy cố định cho hồ sơ.',
    'Đo lại IP thoát nhiều lần để xác nhận tính ổn định.',
  ],
  synchronized_open_burst: [
    'Xem lại quy trình mở hồ sơ; mở so le từng hồ sơ thay vì mở đồng thời nếu không cần thiết.',
    'Nếu mở đồng thời là chủ đích vận hành, ghi nhận lại và bỏ qua cảnh báo này.',
  ],
  identical_sequence: [
    'Xem lại quy trình thao tác đang sao chép giữa hai hồ sơ; thay đổi thứ tự hoặc ngữ cảnh thao tác nếu phù hợp.',
  ],
  bulk_open_close: [
    'Kiểm tra tác vụ hàng loạt hoặc script đang chạy qua API cục bộ.',
  ],
  regular_interval_open: [
    'Xem lại lịch hoặc tác vụ tự động đang mở hồ sơ theo nhịp cố định.',
  ],
  drift_error_rate_increase: [
    'Mở kiểm tra sức khỏe hồ sơ và xử lý các lỗi cấu hình đang tăng.',
    'Lưu thêm snapshot sau khi sửa để đối chiếu lại.',
  ],
  drift_warning_rate_increase: [
    'Mở kiểm tra sức khỏe hồ sơ và xem các cảnh báo cấu hình đang tăng.',
    'Lưu thêm snapshot sau khi xử lý để đối chiếu lại.',
  ],
  drift_app_version_changed: [
    'Đo lại các tiêu chí bị ảnh hưởng sau khi cập nhật ứng dụng (Mục 23).',
  ],
};

const DEFAULT_NEXT_STEPS = [
  'Xem lại mục tương ứng trong ứng dụng và đo lại sau khi thay đổi.',
];

function isRecord(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function iso(ms) { return Number.isFinite(ms) ? new Date(ms).toISOString() : null; }

function makeWarning(fields) {
  const w = {
    id: fields.source + ':' + fields.code + ':' +
      (fields.profiles.length ? fields.profiles.join('+') : 'app') +
      (fields.evidenceScope ? ':' + fields.evidenceScope : ''),
    source: fields.source,
    code: fields.code,
    level: fields.level,
    title: TITLES[fields.code] || fields.code,
    observed: {
      summary: fields.summary,
      profiles: fields.profiles,
      sessionIds: fields.sessionIds || [],
      count: fields.count === undefined ? null : fields.count,
      values: fields.values || {},
    },
    windowFrom: fields.windowFrom === undefined ? null : fields.windowFrom,
    windowTo: fields.windowTo === undefined ? null : fields.windowTo,
    windowFromIso: iso(fields.windowFrom),
    windowToIso: iso(fields.windowTo),
    evaluatedAt: fields.evaluatedAt,
    evaluatedAtIso: iso(fields.evaluatedAt),
    method: fields.method || METHODS[fields.source],
    criterion: CRITERIA[fields.code] || fields.criterion || '',
    limitation: fields.limitation || LIMITATIONS[fields.source],
    nextSteps: NEXT_STEPS[fields.code] || DEFAULT_NEXT_STEPS,
  };
  return w;
}

// --- D2: behaviour patterns ---------------------------------------------
function fromBehaviorPatterns(events, evaluatedAt) {
  const normalised = normalizeEvents(events); // throws on malformed input
  const report = behaviorPatternWarnings(normalised);
  const warnings = report.alerts.map(alert => {
    // D2 messages carry the profile pair for identical_sequence only in
    // prose; extract it strictly, otherwise leave profiles empty and let
    // count + summary carry the fact.
    let profiles = alert.profileId ? [alert.profileId] : [];
    if (alert.code === 'identical_sequence') {
      const m = /^Hai hồ sơ \(([^,]+), ([^)]+)\)/.exec(alert.message || '');
      if (m) profiles = [m[1], m[2]];
    }
    let relevant = normalised;
    if (alert.profileId)
      relevant = normalised.filter(e => e.profileId === alert.profileId);
    const times = relevant.map(e => e.at);
    return makeWarning({
      source: 'behavior-patterns', code: alert.code, level: alert.level,
      summary: alert.message, profiles, count: alert.count,
      windowFrom: times.length ? Math.min(...times) : null,
      windowTo: times.length ? Math.max(...times) : null,
      evaluatedAt,
    });
  });
  return { warnings, meta: { eventsAnalysed: report.eventsAnalysed } };
}

// --- D3: exit-IP observations --------------------------------------------
function fromIpObservations(observations, evaluatedAt) {
  const normalised = normalizeObservations(observations); // throws on bad input
  const profilesBySource = {
    'browser-runtime': new Set(),
    'manager-process': new Set(),
    unlabelled: new Set(),
  };
  const sourceCounts = { browserRuntime: 0, managerProcess: 0, unlabelled: 0 };
  for (const o of normalised) {
    if (o.source === 'browser-runtime') {
      profilesBySource['browser-runtime'].add(o.profileId);
      sourceCounts.browserRuntime++;
    } else if (o.source === 'manager-process') {
      profilesBySource['manager-process'].add(o.profileId);
      sourceCounts.managerProcess++;
    } else {
      profilesBySource.unlabelled.add(o.profileId);
      sourceCounts.unlabelled++;
    }
  }
  // Không trộn manager/runtime/legacy vào cùng một kết luận. Một địa chỉ
  // xuất hiện ở hai nguồn khác nhau không phải là trùng lặp cùng phạm vi đo.
  const partitions = [
    ['browser-runtime', normalised.filter(o => o.source === 'browser-runtime')],
    ['manager-process', normalised.filter(o => o.source === 'manager-process')],
    ['legacy-unlabelled', normalised.filter(o => !o.source)],
  ];
  const warnings = [];
  for (const [measurementSource, group] of partitions) {
    if (!group.length) continue;
    const report = automaticIpWarnings(group);
    const byIpProfiles = new Map();
    for (const o of group) {
      if (!byIpProfiles.has(o.ip)) byIpProfiles.set(o.ip, new Set());
      byIpProfiles.get(o.ip).add(o.profileId);
    }
    for (const w of report.warnings) {
      const involved = group.filter(o => w.profiles.includes(o.profileId));
      const times = involved.map(o => o.observedAt);
      const values = { measurementSource };
      const sessionIds = [...new Set(involved.map(o => o.sessionId).filter(Boolean))];
      if (w.code === 'shared_exit_ip') {
        values.ips = [...byIpProfiles.entries()]
          .filter(([, ps]) => ps.size >= 2 && w.profiles.some(p => ps.has(p)))
          .map(([ip]) => ip).sort();
      } else if (w.code === 'ip_changed_mid_session' || w.code === 'egress_unstable') {
        values.ips = [...new Set(involved.map(o => o.ip))].sort();
      } else if (w.code === 'subnet_concentration' || w.code === 'subnet_overlap') {
        values.subnets = [...new Set(involved.map(o => GraphDefense.getSubnet24(o.ip)))].sort();
      }
      warnings.push(makeWarning({
        source: 'ip-observations', code: w.code, level: w.level,
        evidenceScope: measurementSource,
        summary: w.message, profiles: w.profiles.slice(), sessionIds,
        count: w.code === 'shared_exit_ip' ? w.profiles.length : null,
        values,
        method: measurementSource === 'browser-runtime'
          ? 'Trang thăm dò trong runtime hồ sơ quan sát IP thoát qua endpoint HTTPS đã cấu hình.'
          : measurementSource === 'manager-process'
            ? 'Tiến trình quản lý kiểm tra proxy quan sát IP thoát; đây không phải phép đo trong runtime hồ sơ.'
            : 'Bản ghi IP lịch sử không có nhãn nguồn; không dùng để chứng minh đường thoát runtime.',
        limitation: LIMITATIONS['ip-observations'] +
          ' Quan sát từ tiến trình quản lý hoặc bản ghi không nhãn không thay thế phép đo trong runtime; phép đo IP cũng không chứng minh trạng thái DNS/WebRTC.',
        windowFrom: times.length ? Math.min(...times) : null,
        windowTo: times.length ? Math.max(...times) : null,
        evaluatedAt,
      }));
    }
  }
  return {
    warnings,
    meta: {
      observations: normalised.length,
      profilesObserved: new Set(normalised.map(o => o.profileId)).size,
      runtimeProfiles: [...profilesBySource['browser-runtime']].sort(),
      managerProfiles: [...profilesBySource['manager-process']].sort(),
      unlabelledProfiles: [...profilesBySource.unlabelled].sort(),
      sourceCounts,
    },
  };
}

// --- Health Drift ---------------------------------------------------------
function fromHealthDrift(input, evaluatedAt) {
  let drift = null;
  if (Array.isArray(input)) drift = detectDrift(input);
  else if (isRecord(input) && isRecord(input.drift)) drift = input.drift;
  else if (isRecord(input) && typeof input.status === 'string') drift = input;
  if (!drift || !DRIFT_STATUSES.has(drift.status))
    throw Error('Health Drift input has an unrecognised shape');
  if (drift.status === 'insufficient')
    return {
      warnings: [], notMeasured:
        'Chưa đủ snapshot sức khỏe để so sánh độ trôi: ' +
        (drift.note || 'cần thêm snapshot đã lưu.'),
    };
  const warnings = [];
  const values = {
    errorChange: drift.errorChange, warningChange: drift.warningChange,
    recent: drift.recent || null, baseline: drift.baseline || null,
  };
  if (drift.status === 'investigate')
    warnings.push(makeWarning({
      source: 'health-drift', code: 'drift_error_rate_increase',
      level: 'medium',
      summary: 'Tỉ lệ hồ sơ lỗi cấu hình ở các snapshot gần nhất là ' +
        (drift.recent ? drift.recent.errorRate : '?') + ' so với ' +
        (drift.baseline ? drift.baseline.errorRate : '?') +
        ' ở cửa sổ trước (chênh lệch ' + drift.errorChange + ').',
      profiles: [], values, windowFrom: null, windowTo: null, evaluatedAt,
    }));
  if (drift.status === 'review')
    warnings.push(makeWarning({
      source: 'health-drift', code: 'drift_warning_rate_increase',
      level: 'notice',
      summary: 'Tỉ lệ hồ sơ cảnh báo cấu hình ở các snapshot gần nhất là ' +
        (drift.recent ? drift.recent.warningRate : '?') + ' so với ' +
        (drift.baseline ? drift.baseline.warningRate : '?') +
        ' ở cửa sổ trước (chênh lệch ' + drift.warningChange + ').',
      profiles: [], values, windowFrom: null, windowTo: null, evaluatedAt,
    }));
  if (drift.versionChanged === true)
    warnings.push(makeWarning({
      source: 'health-drift', code: 'drift_app_version_changed',
      level: 'notice',
      summary: 'Phiên bản ứng dụng của snapshot gần nhất khác snapshot ' +
        'trước đó; các kết quả đo trước khi đổi phiên bản có thể cần đo lại.',
      profiles: [], values: {}, windowFrom: null, windowTo: null,
      evaluatedAt,
    }));
  return { warnings, meta: { driftStatus: drift.status } };
}

// --- BehaviorMonitor alerts (optional passthrough) ------------------------
function fromMonitorAlerts(alerts, evaluatedAt) {
  if (!Array.isArray(alerts)) throw Error('monitorAlerts must be an array');
  const warnings = [];
  for (const a of alerts) {
    if (!isRecord(a) || typeof a.code !== 'string' ||
        !['high', 'medium'].includes(a.level) ||
        typeof a.message !== 'string' || !Number.isFinite(a.latestAt))
      throw Error('Invalid BehaviorMonitor alert');
    // Project only the known fields — nothing else may flow through.
    warnings.push(makeWarning({
      source: 'behavior-monitor', code: a.code, level: a.level,
      summary: a.message,
      profiles: typeof a.profileId === 'string' ? [a.profileId] : [],
      count: Number.isFinite(a.count) ? a.count : null,
      windowFrom: null, windowTo: a.latestAt, evaluatedAt,
      criterion: 'Ngưỡng BehaviorMonitor trong cửa sổ 10 phút (mở lặp, ' +
        'chu kỳ mở/đóng nhanh, lưu lặp, mở qua API lặp, mở hàng loạt).',
    }));
  }
  return { warnings, meta: { alertsAnalysed: alerts.length } };
}

function createWarningService({ now = () => Date.now(), seed = null } = {}) {
  if (typeof now !== 'function') throw Error('now must be a function');
  const registry = new Map();
  let active = [];
  // Optional durable-history seed (warningHistory.seedRecords()):
  // restores firstDetectedAt / timesObserved across app restarts.
  // Seeded entries are replaced by fresh normalised warnings on the
  // next evaluate(); evaluate() already carries the three bookkeeping
  // fields over from the previous registry entry, so no other change
  // is needed.
  if (Array.isArray(seed)) for (const w of seed) {
    if (isRecord(w) && typeof w.id === 'string' &&
        Number.isFinite(w.firstDetectedAt) &&
        Number.isInteger(w.timesObserved) && w.timesObserved > 0)
      registry.set(w.id, w);
  }
  let lastSources = {};

  function evaluate(input = {}) {
    if (!isRecord(input)) throw Error('Warning input must be a plain object');
    const evaluatedAt = now();
    const sources = {};
    const fresh = [];
    const run = (key, present, fn, emptyReason) => {
      if (!present) {
        sources[key] = { status: 'not_measured', reason: emptyReason };
        return;
      }
      try {
        const out = fn();
        if (out.notMeasured) {
          sources[key] = { status: 'not_measured', reason: out.notMeasured };
          return;
        }
        sources[key] = { status: 'ok', ...(out.meta || {}) };
        fresh.push(...out.warnings);
      } catch (error) {
        // Fail closed: a broken source is an error, never a quiet pass.
        sources[key] = { status: 'error', reason: String(error && error.message || error) };
      }
    };

    run('behaviorPatterns',
      input.behaviorEvents !== undefined && input.behaviorEvents !== null,
      () => fromBehaviorPatterns(input.behaviorEvents, evaluatedAt),
      'Chưa có nguồn sự kiện hành vi (BehaviorMonitor) được truyền vào.');
    run('ipWarnings',
      Array.isArray(input.ipObservations) && input.ipObservations.length > 0,
      () => fromIpObservations(input.ipObservations, evaluatedAt),
      'Chưa có quan sát IP thoát nào được ghi; nguồn quan sát IP thoát ' +
      'chưa được nối hoặc chưa có lần đo nào (xem INTEGRATION-NOTES).');
    run('healthDrift',
      input.healthDrift !== undefined && input.healthDrift !== null,
      () => fromHealthDrift(input.healthDrift, evaluatedAt),
      'Chưa có dữ liệu Health Drift được truyền vào.');
    if (input.monitorAlerts !== undefined && input.monitorAlerts !== null)
      run('behaviorMonitor', true,
        () => fromMonitorAlerts(input.monitorAlerts, evaluatedAt), '');

    for (const w of fresh) {
      w.evidenceId = JSON.stringify([
        w.source, w.code, w.observed.profiles, w.observed.sessionIds,
        w.windowFrom, w.windowTo, w.observed.values,
      ]);
      const prev = registry.get(w.id);
      if (prev) {
        w.firstDetectedAt = prev.firstDetectedAt;
        const changed = prev.evidenceId !== w.evidenceId;
        w.timesObserved = prev.timesObserved + (changed ? 1 : 0);
        w.lastDetectedAt = changed ? evaluatedAt : prev.lastDetectedAt;
      } else {
        w.firstDetectedAt = evaluatedAt;
        w.timesObserved = 1;
        w.lastDetectedAt = evaluatedAt;
      }
      registry.set(w.id, w);
    }
    active = fresh;
    lastSources = sources;
    return report(sources, evaluatedAt);
  }

  function report(sources, evaluatedAt) {
    const warnings = [...active].sort((a, b) =>
      (LEVELS[b.level] || 0) - (LEVELS[a.level] || 0) ||
      (b.windowTo || 0) - (a.windowTo || 0));
    const history = [...registry.values()].sort((a, b) =>
      (b.lastDetectedAt || 0) - (a.lastDetectedAt || 0));
    const statuses = Object.values(sources).map(s => s.status);
    const anyError = statuses.some(s => s === 'error');
    const anyOk = statuses.some(s => s === 'ok');
    const allOk = statuses.length > 0 && statuses.every(s => s === 'ok');
    // 'normal' is only allowed when every consulted source actually ran
    // (Mục 16: no complete-looking verdict while a criterion is
    // unmeasured). With some sources missing, the honest overall state
    // of a warning-free run is 'incomplete'.
    const overall = warnings.length
      ? (warnings.some(w => w.level === 'high') ? 'high'
        : warnings.some(w => w.level === 'medium') ? 'medium' : 'notice')
      : anyError ? 'error' : allOk ? 'normal'
      : anyOk ? 'incomplete' : 'not_measured';
    return {
      generatedAt: evaluatedAt,
      generatedAtIso: iso(evaluatedAt),
      overall,
      warningCount: warnings.length,
      sources,
      warnings,
      history,
      note: 'Cảnh báo chỉ mô tả mẫu quan sát được bởi ứng dụng, kèm ' +
        'thời điểm và giới hạn kết luận (Mục 19.2, 20.2, 22). Trạng thái ' +
        'not_measured nghĩa là chưa có bằng chứng để kết luận — không ' +
        'phải là đạt.',
    };
  }

  return {
    evaluate,
    list: () => report(lastSources, now()),
    reset: () => { registry.clear(); active = []; lastSources = {}; },
  };
}

module.exports = { createWarningService };
