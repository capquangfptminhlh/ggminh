'use strict';
const assert=require('node:assert/strict');
const {internalCamoufoxPreview,internalPreviewUserData}=require('../src/engine/camoufoxInternalPreview');
const options={packaged:false,enabled:'1',directory:'D:\\fixture\\engine',platform:'win32',version:'156.0.1',sha256:'a235730786ee4e27b7e5087751509b2d456b0f03ce73d04bbb1b9077458764c6'};
assert.deepEqual(internalCamoufoxPreview(options),{manual:true,proxyTypes:[],evidence:'internal-signed-preview',reason:null});
for(const changed of [{packaged:true},{enabled:'0'},{directory:''},{version:'156.0.2'},{sha256:'b'.repeat(64)},{platform:'linux'}])
 assert.equal(internalCamoufoxPreview({...options,...changed}),null);
console.log('Internal Camoufox preview remains version pinned and direct-only: PASS');
const dataOptions={packaged:false,enabled:'1',platform:'win32',appData:'C:\\Users\\test\\AppData\\Roaming'};
assert.equal(internalPreviewUserData(dataOptions),'C:\\Users\\test\\AppData\\Roaming\\LHM Camoufox Internal Preview');
for(const changed of [{packaged:true},{enabled:'0'},{platform:'linux'},{appData:'relative'}])
 assert.equal(internalPreviewUserData({...dataOptions,...changed}),null);
