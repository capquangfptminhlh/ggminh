'use strict';
const path=require('node:path');
function pinnedBaseFor508(storageDir){
 if(typeof storageDir!=='string'||!path.isAbsolute(storageDir))throw Error('Absolute storage directory required');
 return path.join(storageDir,'engines-pinned-clean508');
}
module.exports={pinnedBaseFor508};
