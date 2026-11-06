'use strict';
// LHM_CI_UI_CAPTURE must switch userData before Chromium starts. Set inside
// whenReady, Local State and GPU caches still land in %APPDATA%\power-browser.
const assert = require('assert');
const fs = require('fs'), path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const setPath = main.indexOf("app.setPath('userData', path.join(os.tmpdir(), 'lhm-ui-ci-'");
const ready = main.indexOf('app.whenReady()');
assert(setPath > 0, 'capture mode uses its own data folder');
assert(ready > 0);
assert(setPath < ready, 'capture data folder is chosen before app.whenReady()');
const lock = main.indexOf('app.requestSingleInstanceLock()');
assert(lock > setPath, 'single-instance lock is keyed to the capture folder, not the real one');
console.log('CI UI capture: data folder isolated before Chromium starts');
