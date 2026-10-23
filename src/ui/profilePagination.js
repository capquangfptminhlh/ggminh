'use strict';
// Side-effect-free page model shared by the renderer and Node tests.
// Filtering applies to the FULL metadata collection first; the DOM only
// receives a bounded slice. Selection stays ID-based in the caller.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LHMProfilePagination = api;
})(typeof window !== 'undefined' ? window : null, function() {
  const SIZE_OPTIONS = Object.freeze([25, 50, 100]);
  const DEFAULT_SIZE = 50;

  function paginate(items, requestedPage = 1, requestedSize = DEFAULT_SIZE) {
    if (!Array.isArray(items)) throw new TypeError('Expected filtered profile array');
    const size = SIZE_OPTIONS.includes(requestedSize) ? requestedSize : DEFAULT_SIZE;
    const total = items.length;
    const pageCount = Math.max(1, Math.ceil(total / size));
    const numericPage = Number.isSafeInteger(requestedPage) ? requestedPage : 1;
    const page = Math.min(Math.max(1, numericPage), pageCount);
    const start = (page - 1) * size;
    return {
      page, size, total, pageCount,
      from: total ? start + 1 : 0,
      to: Math.min(total, start + size),
      items: items.slice(start, start + size),
      hasPrevious: page > 1,
      hasNext: page < pageCount,
    };
  }

  return Object.freeze({ paginate, SIZE_OPTIONS, DEFAULT_SIZE });
});
