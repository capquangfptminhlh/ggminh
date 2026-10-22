'use strict';
// Policy regression: LHM may ship an unsigned Windows application installer,
// but must retain independent engine/update verification and owner acceptance.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const constitution = read('TIEU-CHI-SAN-PHAM.md');
const pipeline = read('RELEASE-PIPELINE.md');
const checklist = read('docs/release/RELEASE-CHECKLIST.md');
const pkg = JSON.parse(read('package.json'));

assert(constitution.includes('Bản v1.4 (2026-10-22, chủ dự án quyết định)'),
  'Owner signing-policy amendment must be recorded in Constitution');
assert(constitution.includes('KHÔNG yêu cầu') &&
  constitution.includes('Authenticode') &&
  constitution.includes('EXE/installer'),
  'EXE signing must be optional, not a commercial gate');
assert(constitution.includes('Gate 3') && constitution.includes('Gate 4') &&
  constitution.includes('SHA-256'),
  'Installer policy must preserve independent Windows acceptance and EXE digest');
assert(constitution.includes('manifest ký Ed25519') &&
  constitution.includes('chữ ký cập nhật') &&
  constitution.includes('không tải/chạy engine chưa kiểm chứng'),
  'Do not confuse optional EXE Authenticode with mandatory engine/update safety');
assert(constitution.includes('Không yêu cầu tắt Defender/SmartScreen'),
  'No bypass of Windows security protections');
assert(pipeline.includes('KHÔNG BẮT BUỘC / được chủ dự án miễn') &&
  pipeline.includes('EXE/installer') &&
  pipeline.includes('Công bố rõ'),
  'Release pipeline should use the updated owner policy and transparent disclosure');
assert(checklist.includes('tùy chọn, KHÔNG phải cổng bắt buộc'),
  'Owner release checklist should not block commercial launch for Authenticode');
assert(pkg.build && pkg.build.win && pkg.build.win.forceCodeSigning !== true,
  'Packaged Windows builder must not force app signing');
assert(pkg.scripts['build:win'].includes('--win nsis') &&
  pkg.scripts['build:win'].includes('--publish never'),
  'Preserve existing Windows installer target and no automatic publishing');
// The owner waived ONLY installer signing: existing proprietary functions remain.
for(const p of [
 'src/engine/EngineFactory.js', 'src/health/signalChain.js',
 'src/security/proxyCredentialVault.js', 'src/automation/studio.js',
 'src/ai/advisor.js', 'src/ai/usageBudget.js',
 'src/engine/camoufoxRuntimeGate.js', 'src/ops/adspowerJsonImport.js'
]) assert(fs.existsSync(path.join(root,p)), 'LHM native feature was removed: '+p);
console.log('Owner constitution: unsigned installer allowed; engine/update trust and LHM features preserved');
