'use strict';
// Reuse the fully tested Chromium spawn, proxy, extension and CDP launcher.
class ChromiumAdapter{
 constructor(launcher){this.launcher=launcher;}
 launch(profile,{customUrl}={}){
  return this.launcher._launchInstalled(profile,customUrl,'chromium');
 }
}
module.exports=ChromiumAdapter;