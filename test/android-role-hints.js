'use strict';
const assert=require('node:assert/strict');
const {roleForType,safeHint}=require('../src/android/uiRoleHints');
const {parseHierarchy}=require('../src/android/uiInspector');
const {sameTarget}=require('../src/android/targetGuard');

assert.equal(roleForType('Button'),'button');
assert.equal(roleForType('EditText'),'text-input');
assert.equal(roleForType('CheckBox'),'toggle');
assert.equal(roleForType('ImageButton'),'button');
assert.equal(roleForType('SomeCustomView'),'interactive-view');
assert.equal(safeHint('Tìm kiếm',''),'search');
assert.equal(safeHint('','Quay lại'),'back');
assert.equal(safeHint('Next','Tiếp theo'),'next');
assert.equal(safeHint('Cancel payment',''),null);
assert.equal(safeHint('123456 OTP',''),null);
assert.equal(safeHint('Account user@example.com',''),null);
assert.equal(safeHint('Back','Search'),null);
assert.equal(safeHint('abc'.repeat(50),'Search'),'search');

const input = [
 '<hierarchy rotation="0">',
 '<node text="Tìm kiếm" content-desc="Tìm kiếm" class="android.widget.Button" ',
 'clickable="true" enabled="true" password="false" bounds="[10,20][110,120]" />',
 '<node text="secret > 123456 OTP" content-desc="user@example.com" class="android.widget.ImageButton" ',
 'clickable="true" enabled="true" password="false" bounds="[120,20][220,120]" />',
 '<node text="private" password="true" class="android.widget.EditText" ',
 'clickable="true" enabled="true" bounds="[250,20][350,120]" />',
 '</hierarchy>'
].join('');
const parsed=parseHierarchy(input);
assert.equal(parsed.totalNodes,3);
assert.equal(parsed.elements.length,2);
assert.equal(parsed.elements[0].hint,'search');
assert.equal(parsed.elements[0].role,'button');
assert.equal(parsed.elements[1].hint,null);
const output=JSON.stringify(parsed);
for(const secret of ['OTP','123456','user@example.com','secret','private'])
  assert(!output.includes(secret), 'Sensitive data escaped: '+secret);
const a=parsed.elements[0], b=structuredClone(a);
assert(sameTarget(a,b));
b.hint='back';
assert.equal(sameTarget(a,b),false);
b.hint=a.hint;b.role='toggle';
assert.equal(sameTarget(a,b),false);
console.log('Android offline UI role hints and privacy tests: PASS');
