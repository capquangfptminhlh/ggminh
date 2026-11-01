'use strict';

// Offline, closed-vocabulary UI hints. Never emit arbitrary Android app text.
// These hints are *not* semantic action verification or user approval.
const HINTS = Object.freeze({
  'back':'back', 'quay lại':'back', 'trở lại':'back',
  'home':'home', 'trang chủ':'home',
  'search':'search', 'tìm kiếm':'search',
  'menu':'menu', 'danh mục':'menu',
  'close':'close', 'đóng':'close',
  'next':'next', 'tiếp theo':'next'
});
const ALLOWED_HINTS = new Set(Object.values(HINTS));

function roleForType(type) {
  if (type === 'Button' || type === 'ImageButton') return 'button';
  if (type === 'EditText') return 'text-input';
  if (type === 'CheckBox' || type === 'Switch' || type === 'RadioButton')
    return 'toggle';
  if (type === 'Spinner') return 'picker';
  if (type === 'SeekBar') return 'slider';
  return 'interactive-view';
}

function safeHint(text,description) {
  const hintOf = input => {
    if (typeof input !== 'string' || input.length > 100) return null;
    const cleaned = input.normalize('NFC').trim().toLocaleLowerCase('vi');
    return Object.prototype.hasOwnProperty.call(HINTS,cleaned) ?
      HINTS[cleaned] : null;
  };
  const first=hintOf(text), second=hintOf(description);
  // Conflicting labels are ambiguous; do not guess.
  if (first && second && first !== second) return null;
  const candidate = first || second;
  return ALLOWED_HINTS.has(candidate) ? candidate : null;
}

module.exports = {roleForType,safeHint};
