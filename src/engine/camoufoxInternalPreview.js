'use strict';

const path=require('node:path');
const RC_SHA256='a235730786ee4e27b7e5087751509b2d456b0f03ce73d04bbb1b9077458764c6';

function internalCamoufoxPreview({packaged,enabled,directory,platform,version,sha256}){
 if(packaged!==false||enabled!=='1'||platform!=='win32'||typeof directory!=='string'||
    !path.win32.isAbsolute(directory)||version!=='156.0.1'||sha256!==RC_SHA256)return null;
 return {manual:true,proxyTypes:[],evidence:'internal-signed-preview',reason:null};
}

function internalPreviewUserData({packaged,enabled,platform,appData}){
 if(packaged!==false||enabled!=='1'||platform!=='win32'||typeof appData!=='string'||
    !path.win32.isAbsolute(appData))return null;
 return path.win32.join(appData,'LHM Camoufox Internal Preview');
}

module.exports={internalCamoufoxPreview,internalPreviewUserData};
