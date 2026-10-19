/* LHM Icon System — one coherent 24x24, 1.8px outline set; no CDN. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const paths = Object.freeze({
    'panels-top-left': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    'layout-dashboard': '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    'network': '<rect x="9" y="2" width="6" height="6" rx="1.5"/><rect x="2" y="16" width="6" height="6" rx="1.5"/><rect x="16" y="16" width="6" height="6" rx="1.5"/><path d="M12 8v4M5 16v-4h14v4"/>',
    'workflow': '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/><rect x="9" y="15" width="6" height="6" rx="1.5"/><path d="M9 6h6M18 9v3h-6v3M6 9v3h6"/>',
    'layers': '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    'activity': '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    'database-backup': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3 1 0 2-.1 3-.2M3 11v6c0 1.7 4 3 9 3M21 5v6"/><path d="M21 17v5m-3-2 3 2 3-2" transform="translate(-2 -2)"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'search': '<circle cx="11" cy="11" r="7.5"/><path d="m16.5 16.5 4 4"/>',
    'refresh-cw': '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.9 9a7 7 0 0 1 12.5-2L20 12M4 12l1.6 5a7 7 0 0 0 12.5-2"/>',
    'play': '<path d="m8 5 11 7-11 7V5Z"/>',
    'square': '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    'edit': '<path d="M12 20h9M4 17.5 16 5.5a2.1 2.1 0 0 1 3 3L7 20H4v-2.5Z"/>',
    'trash': '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/>',
    'terminal': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 9 3 3-3 3M12 16h5"/>',
    'copy': '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    'folder': '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    'info': '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    'filter': '<path d="M4 4h16l-6.5 7.5V20l-3-2v-6.5L4 4Z"/>',
    'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/>'
  });
  function create(name) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.classList.add('lhm-icon');
    svg.setAttribute('aria-hidden','true');
    // Paths are fixed by the application's bundled allowlist, never from data.
    svg.innerHTML = paths[name] || paths['info'];
    return svg;
  }
  function decorate(root = document) {
    const nodes = [];
    if (root.matches?.('[data-lhm-icon]')) nodes.push(root);
    nodes.push(...root.querySelectorAll('[data-lhm-icon]'));
    for (const host of nodes) {
      if (host.querySelector(':scope > svg.lhm-icon')) continue;
      host.prepend(create(host.getAttribute('data-lhm-icon')));
    }
  }
  window.LHMIcons = Object.freeze({ create, decorate, names: Object.keys(paths) });
  if(document.readyState === 'loading')document.addEventListener('DOMContentLoaded',()=>decorate());
  else decorate();
})();