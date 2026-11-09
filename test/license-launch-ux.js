'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const {messageForBlockedLicense}=require('../src/ui/licenseBlockMessage');

assert.equal(messageForBlockedLicense({access:'blocked',reason:'trial_expired',status:'inactive'}),
 'Thời gian dùng thử 10 ngày đã kết thúc. Hồ sơ và dữ liệu vẫn được giữ nguyên. Hãy kích hoạt hoặc gia hạn giấy phép để mở trình duyệt.');
assert.match(messageForBlockedLicense({access:'blocked',reason:'expired',status:'expired'}),
 /Giấy phép đã hết hạn.*gia hạn/);
assert.match(messageForBlockedLicense({access:'blocked',reason:'revoked',online:{state:'revoked'}}),
 /bị thu hồi/);
assert.match(messageForBlockedLicense({access:'blocked',reason:'clock_error'}),
 /ngày giờ Windows/);
assert.equal(messageForBlockedLicense({access:'licensed',allowed:true}),null);

const renderer=fs.readFileSync(path.join(root,'src/ui/renderer.js'),'utf8');
const center=fs.readFileSync(path.join(root,'src/ui/licenseCenter.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/ui/index.html'),'utf8');
assert(renderer.includes('window.LHMLicenseCenter.ensureProfilesAllowed()'),
 'Open-profile action must preflight the license before other launch dialogs');
assert(renderer.indexOf('ensureProfilesAllowed()')<
 renderer.indexOf('LHMLaunchReadiness.confirm(profile.id)'),
 'License preflight must run before launch readiness/resource prompts');
assert(renderer.includes('window.LHMLicenseCenter.handleOperationError(error)'),
 'A state change between preflight and main-process launch must route back to License Center');
assert(center.includes('window.LHMLicenseCenter ='));
assert(center.includes('messageForBlockedLicense'));
assert(center.includes("addEventListener('click',()=>show())"),
 'A click event object must not be rendered as the License Center announcement');
assert(html.includes('<script src="licenseBlockMessage.js"></script>'));
assert(html.indexOf('licenseBlockMessage.js')<html.indexOf('renderer.js'));
console.log('Expired-trial launch opens License Center with a precise recovery message');
