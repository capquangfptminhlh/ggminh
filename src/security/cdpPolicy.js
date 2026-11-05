'use strict';
/**
 * Chromium's remote-debugging (CDP) port has no authentication: while it is
 * open, ANY local process — including other Windows users on a shared
 * RDP/VPS host — can attach and read every cookie and login of that
 * profile. Chrome offers no way to restrict who may connect.
 *
 * So the port is opened only when the user turned on BOTH the Local API and
 * the separate "automation (CDP)" option, which the UI shows with a clear
 * warning. Manual browsing and the Local API alone never open it.
 */
function cdpAllowed(settings) {
  return !!settings && settings.apiEnabled === true && settings.cdpEnabled === true;
}

const CDP_DISABLED_MESSAGE =
  'Cổng tự động hoá (CDP) đang tắt. Bật "Tự động hoá (CDP)" trong menu Công cụ ' +
  'rồi mở lại hồ sơ. Lưu ý: khi bật, mọi chương trình trên máy kết nối được vào hồ sơ đang mở.';

module.exports = { cdpAllowed, CDP_DISABLED_MESSAGE };
