'use strict';
// Existing Firefox spawn/preferences lifecycle preserved as-is.
class FirefoxAdapter{
 constructor(launcher){this.launcher=launcher;}
 launch(profile,{customUrl}={}){
  return this.launcher._launchInstalled(profile,customUrl,'gecko');
 }
}
module.exports=FirefoxAdapter;