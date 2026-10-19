const { BrowserWindow, session } = require('electron');
const { checkUrl } = require('./studio');

function createWindowBrowser(profileId, hosts) {
  const partition='persist:lhm-automation-'+profileId;
  const browser=new BrowserWindow({
    width:1050,height:730,minWidth:740,minHeight:500,
    title:'LHM Automation Sandbox',autoHideMenuBar:true,
    webPreferences:{partition,contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  const allowed=url=>{
    try {checkUrl(url,hosts);return true;} catch (_) {return false;}
  };
  browser.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  browser.webContents.on('will-navigate',(event,url)=>{
    if(!allowed(url))event.preventDefault();
  });
  browser.webContents.on('will-redirect',(event,url)=>{
    if(!allowed(url))event.preventDefault();
  });
  browser.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  return {
    open:async url=>{
      if(browser.isDestroyed())throw Error('Cửa sổ trình duyệt đã đóng');
      await browser.loadURL(checkUrl(url,hosts));
    },
    url:async ()=>{
      if(browser.isDestroyed())throw Error('Cửa sổ đã đóng');
      return browser.webContents.getURL();
    },
    evaluate:async js=>{
      if(browser.isDestroyed())throw Error('Cửa sổ đã đóng');
      return browser.webContents.executeJavaScript(js,true);
    },
    close:()=>{if(!browser.isDestroyed())browser.destroy();}
  };
}
module.exports={createWindowBrowser};
