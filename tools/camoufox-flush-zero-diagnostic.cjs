'use strict';
// Synthetic CI diagnostic only. This setting is not applied by the product.
const firefox=require('playwright-core').firefox;
const launch=firefox.launchPersistentContext;
firefox.launchPersistentContext=function(dir,options){
 return launch.call(this,dir,{...options,firefoxUserPrefs:{
  ...options.firefoxUserPrefs,'dom.storage.flush_timeout_ms':0
 }});
};
console.log('DIAGNOSTIC ONLY: patched engine, flush timeout 0 ms; not release evidence');
