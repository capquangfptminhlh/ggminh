'use strict';

// Metadata-only importer for user-provided AdsPower profile-list JSON.
// Never carry third-party code, stored sessions, credentials, fingerprints,
// account identifiers or proxy parameters into an LHM profile.
const MAX_BYTES = 256 * 1024;
const MAX_PROFILES = 200;

function limitedText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function urlList(value, row) {
  if (value === undefined || value === null || value === '') return [];
  let urls = value;
  if (typeof urls === 'string') {
    const input = urls.trim();
    if (input.startsWith('[')) {
      try { urls = JSON.parse(input); }
      catch (_) { throw Error('JSON profile ' + row + ': invalid open_urls'); }
    } else urls = input ? input.split('|') : [];
  }
  if (!Array.isArray(urls) || urls.length > 10 || urls.some(u => typeof u !== 'string'))
    throw Error('JSON profile ' + row + ': open_urls/tabs must be an array of at most 10 URLs');
  return urls.map(u => u.trim()).filter(Boolean);
}

function tagNames(value) {
  if (!Array.isArray(value)) return [];
  // Ignore tag IDs and objects: only plainly named tags are portable.
  return value.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean);
}

function parseAdsPowerProfileJson(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_BYTES)
    throw Error('JSON must be text, at most 256 KB');
  let document;
  try { document = JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch (_) { throw Error('Invalid profile JSON'); }
  const entries = Array.isArray(document) ? document
    : Array.isArray(document?.data?.list) ? document.data.list
    : Array.isArray(document?.list) ? document.list : null;
  if (!entries || entries.length === 0)
    throw Error('JSON needs a profile array or {"data":{"list":[...]}}');
  if (entries.length > MAX_PROFILES) throw Error('Maximum 200 profiles per import');

  return entries.map((entry, i) => {
    const row = i + 1;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw Error('JSON profile ' + row + ': invalid record');
    const name = limitedText(entry.name);
    if (!name) throw Error('JSON profile ' + row + ': missing name');
    const group = limitedText(entry.group_name, 'Default') || 'Default';
    const urls = urlList(entry.open_urls ?? entry.tabs, row);
    const tags = tagNames(entry.profile_tag_names ?? entry.tags);
    // Every imported profile requires an explicitly selected proxy before launch.
    // A silent direct-network fallback could reveal a customer's original IP.
    return {
      name, group, engine: 'chromium',
      starturls: urls.join('|'), tags: tags.join('|'), notes: '',
      proxytype: 'direct', proxyhost: '', proxyport: '',
      requiresproxysetup: true
    };
  });
}

module.exports = { parseAdsPowerProfileJson };
