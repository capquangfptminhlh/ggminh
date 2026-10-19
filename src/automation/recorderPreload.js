// Runs in the isolated sandbox world of the temporary Recorder window.
// Nothing is exposed to websites. Values, key presses, cookies, passwords and
// form contents never leave the page. Only permitted element selectors are sent.
const { ipcRenderer } = require('electron');
(() => {
  const PRIVATE = /password|passcode|otp|captcha|token|secret|credit.card|card.number|cvv|cvc|email|phone|address/i;
  function isPrivate(element) {
    if (!(element instanceof Element)) return true;
    const input = element.closest('input,textarea,select');
    if (!input) return false;
    const type = String(input.getAttribute('type') || '').toLowerCase();
    const meta = [
      input.getAttribute('name'), input.id, input.getAttribute('autocomplete'),
      input.getAttribute('placeholder'), input.getAttribute('aria-label')
    ].filter(Boolean).join(' ');
    return ['password','hidden','email','tel','number','file'].includes(type) ||
      PRIVATE.test(meta) || input.isContentEditable;
  }
  function cssSelector(element) {
    if (!element || !(element instanceof Element)) return null;
    const target = element.closest('button,a,input,textarea,select,[role="button"]') || element;
    if (isPrivate(target)) return null;
    const escape = CSS.escape;
    if (target.id && !PRIVATE.test(target.id)) return '#' + escape(target.id);
    const testId = target.getAttribute('data-testid');
    if (testId && testId.length <= 70 && !PRIVATE.test(testId)) {
      return '[data-testid="' + testId.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"]';
    }
    const name = target.getAttribute('name');
    if (name && name.length <= 70 && !PRIVATE.test(name)) {
      return target.tagName.toLowerCase() + '[name="' + name.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"]';
    }
    const segments = [];
    let node = target;
    for (let i = 0; i < 5 && node && node.nodeType === 1; i++, node = node.parentElement) {
      let segment = node.tagName.toLowerCase();
      if (node.id && !PRIVATE.test(node.id)) {
        segments.unshift('#' + escape(node.id));
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const matches = Array.from(parent.children).filter(child => child.tagName === node.tagName);
        if (matches.length > 1) segment += ':nth-of-type(' + (matches.indexOf(node)+1) + ')';
      }
      segments.unshift(segment);
    }
    const selector = segments.join(' > ');
    return selector.length <= 240 ? selector : null;
  }
  function send(type, target) {
    if (isPrivate(target)) return;
    const selector = cssSelector(target);
    if (!selector || !location.href.startsWith('http')) return;
    ipcRenderer.send('lhm-recorder-action', { type, selector, url: location.href.split('?')[0].split('#')[0] });
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted || event.button !== 0) return;
    const target = event.target instanceof Element
      ? event.target.closest('button,a,input[type="button"],input[type="submit"],[role="button"]') : null;
    if (target) send('click', target);
  }, true);
  // Only the field location is recorded. Never read, send or persist its value.
  document.addEventListener('change', event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const field = event.target.closest('input,textarea,select');
    if (field) send('fill', field);
  }, true);
})();
