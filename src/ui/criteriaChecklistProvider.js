'use strict';
/*
 * Data provider for the per-criteria checklist (Agent 9 frame,
 * contract in docs/agents/agent-9/INTEGRATION-NOTES.md).
 *
 * Honesty rules (Constitution Sections 16/22): an entry is only
 * produced when a real data source in the app covers that criterion
 * for THIS profile. Criteria without a wired source are omitted —
 * the frame renders them as CHUA DO (unmeasured), which is the true
 * current state. No overall verdict is ever produced here.
 *
 * Wired sources today:
 *  - cross-profile-coincidence + network-route: the unified warning
 *    report (window.api.getWarningReport), whose D3 source evaluates
 *    recorded exit-IP observations for the whole fleet. A warning
 *    whose observed profiles include this profile => 'fail' with the
 *    warning's own evidence fields. When the D3 source reports
 *    not_measured, both entries stay omitted (unmeasured).
 */
(function () {
  const ROUTE_CODES = ['ip_changed_mid_session', 'egress_unstable'];
  const COINCIDENCE_CODES = ['shared_exit_ip', 'subnet_concentration', 'subnet_overlap'];
  function warningEntriesFor(report, profileId) {
    const entries = [];
    if (!report || !report.sources) return entries;
    const d3 = report.sources.ipWarnings;
    const ipMeasured = d3 && d3.status === 'ok';
    if (!ipMeasured) return entries;
    const mine = (report.warnings || []).filter(w =>
      w && w.source === 'ip-observations' && w.observed &&
      Array.isArray(w.observed.profiles) &&
      w.observed.profiles.includes(profileId));
    const ipWarnings = mine;
    const toEntry = (id, w) => ({
      id, status: 'fail',
      evidence: w.observed.summary || w.title,
      observedAt: w.lastDetectedAt || w.evaluatedAt || '',
      method: w.method || 'Canh bao tu dong tu quan sat IP thoat cua ung dung',
      limit: w.limitation || '',
      nextStep: (w.nextSteps && w.nextSteps[0]) || '',
    });
    if (ipWarnings.length) {
      const route = ipWarnings.find(w => ROUTE_CODES.includes(w.code)) || ipWarnings[0];
      entries.push(toEntry('network-route', route));
      const shared = ipWarnings.find(w => COINCIDENCE_CODES.includes(w.code));
      if (shared) entries.push(toEntry('cross-profile-coincidence', shared));
    } else {
      entries.push({
        id: 'network-route', status: 'pass',
        evidence: 'Khong co canh bao IP thoat nao cho ho so nay trong lan danh gia gan nhat',
        observedAt: report.evaluatedAt || '',
        method: 'Dich vu canh bao thong nhat (D3) tren quan sat IP thoat da ghi',
        limit: 'Chi dua tren cac quan sat IP thoat ung dung da ghi lai; khong bao gom DNS/WebRTC (chua do).',
        nextStep: '',
      });
    }
    return entries;
  }

  window.LHMCriteriaChecklistProvider = async (profileId) => {
    let profileName = '';
    try {
      const profiles = await window.api.getProfiles();
      const found = (profiles || []).find(p => p.id === profileId);
      if (found) profileName = found.name || '';
    } catch (_) { /* name is cosmetic; entries matter */ }
    let report = null;
    try { report = await window.api.getWarningReport(); } catch (_) { report = null; }
    return {
      profileName,
      sample: false,
      entries: warningEntriesFor(report, profileId),
    };
  };
})();
