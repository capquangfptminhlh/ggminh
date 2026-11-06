'use strict';
/*
 * Copy text and prove it landed. On Windows another program (remote-desktop
 * clipboard sync, clipboard managers) can hold the clipboard; Electron 44's
 * clipboard.writeText then resolves without copying anything, and the UI
 * would tell the user "copied" while the clipboard is empty.
 */
const CLIPBOARD_COPY_FAILED = 'Không sao chép được vào clipboard: một chương trình khác (ví dụ phần mềm điều khiển từ xa) đang giữ clipboard. Đợi vài giây rồi thử lại.';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function copyTextVerified(clipboard, text, { attempts = 3, delayMs = 150 } = {}) {
  if (typeof text !== 'string' || !text) throw new Error('Nothing to copy');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await clipboard.writeText(text);
      if (await clipboard.readText() === text) return true;
    } catch (_) { /* clipboard busy: retry below */ }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error(CLIPBOARD_COPY_FAILED);
}

module.exports = { copyTextVerified, CLIPBOARD_COPY_FAILED };
