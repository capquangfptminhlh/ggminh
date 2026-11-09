'use strict';
// UI rebuild phase 8: Ads Launch Guard, AI Advisor and About are split into
// tabs. Real-app check at the owner's window size: 14/14 (link check, UTM
// build, QA checklist, AI settings first without a key, About update and
// customer handoff). Body scroll was 2.4x / 2.2x / 1.9x the visible height.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ui = path.join(__dirname, '..', 'src', 'ui');
const read = f => fs.readFileSync(path.join(ui, f), 'utf8');
const html = read('index.html');
const dialog = id => { const s = html.indexOf('<div class="modal-overlay" id="' + id + '">'); assert(s >= 0, id); return html.slice(s, html.indexOf('<div class="modal-overlay', s + 10)); };
const inPane = (d, pane, id) => {
  const a = d.indexOf('id="' + pane + '"'); assert(a >= 0, 'pane ' + pane);
  const b = d.indexOf('class="tab-content', a + 5);
  const i = d.indexOf('id="' + id + '"'); assert(i >= 0, 'missing ' + id);
  assert(i > a && (b < 0 || i < b), id + ' should be inside ' + pane);
};
const expectTabs = (d, panes) => { for (const p of panes) assert(d.includes('data-tab="' + p + '"') && d.includes('id="' + p + '"'), 'tab ' + p); assert(d.includes('class="tabs lhm-steps lhm-dialog-tabs"')); };

const ads = dialog('modal-ads-launch-guard');
expectTabs(ads, ['ads-tab-check', 'ads-tab-utm', 'ads-tab-report']);
inPane(ads, 'ads-tab-check', 'ads-guard-inspect'); inPane(ads, 'ads-tab-utm', 'ads-guard-build'); inPane(ads, 'ads-tab-report', 'ads-qa-export');
assert(!/<h3>0\d \//.test(ads), 'numbered section titles left');

const ai = dialog('modal-ai-advisor');
expectTabs(ai, ['ai-tab-ask', 'ai-tab-draft', 'ai-tab-settings']);
inPane(ai, 'ai-tab-ask', 'ai-advisor-question'); inPane(ai, 'ai-tab-ask', 'ai-advisor-ask'); inPane(ai, 'ai-tab-ask', 'ai-advisor-answer');
inPane(ai, 'ai-tab-draft', 'ai-draft-generate');
inPane(ai, 'ai-tab-settings', 'ai-advisor-key'); inPane(ai, 'ai-tab-settings', 'ai-advisor-monthly-budget');
const aiJs = read('aiAdvisor.js');
assert(aiJs.includes('data-tab="ai-tab-settings"') && aiJs.includes('Cần lưu API key'), 'AI Advisor must lead to settings when no key');

const about = dialog('modal-app-about');
expectTabs(about, ['about-tab-version', 'about-tab-handoff']);
inPane(about, 'about-tab-version', 'lhm-about-version'); inPane(about, 'about-tab-version', 'lhm-update-check');
inPane(about, 'about-tab-version', 'lhm-upgrade-safety-check'); inPane(about, 'about-tab-handoff', 'lhm-customer-check');
// The online update buttons come before the longer upgrade-readiness block.
assert(about.indexOf('id="lhm-update-check"') < about.indexOf('class="lhm-upgrade-readiness"'));

// Tabbed dialogs reopen on their first tab.
assert(read('compactWorkspace.js').includes(".lhm-dialog-tabs .tab-btn"));
const css = read('system.css');
assert(css.includes('.lhm-dialog-pane{display:none}') && css.includes('.lhm-dialog-pane.active{display:block}'));
// Faint text fixed: behaviour empty state / footnote and the command palette use the muted token.
assert(/\.behavior-footnote \{[^}]*var\(--lhm-muted/.test(read('styles.css')));
assert(/\.lhm-v7-command-top p\{color:var\(--lhm-muted/.test(read('workspaceInteractions.css')));
console.log('Phase 8 tabbed dialogs: Ads Guard, AI Advisor, About tabs and readable muted text passed');
