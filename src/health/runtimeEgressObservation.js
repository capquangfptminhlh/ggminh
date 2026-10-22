'use strict';
/**
 * Runtime exit-IP observation (Constitution 19.1, 19.3, 19.4, 22).
 *
 * The exit-IP observations the app records at profile start are made by
 * checkProxy in the MANAGER process. Section 19.3 is explicit: a result
 * from the manager process does not substitute for a result from the
 * profile's own runtime. This module makes the runtime observation for
 * sessions the app drives through CamoufoxPlaywrightController:
 *
 *   1. From INSIDE a page of the running profile's browser context it
 *      fetches an echo endpoint. The request travels the profile's own
 *      network route (its proxy plan is a property of the context), so
 *      the address the echo server sees is the runtime's exit address
 *      as seen by a server — the same class of fact the manager check
 *      produces, but observed on the correct side of the boundary.
 *   2. The address the echo reports is parsed and validated as a
 *      canonical IPv4 and, when a store is supplied, recorded through
 *      ExitIpObservationStore with source 'browser-runtime' — labelled,
 *      never merged with 'manager-process' records (19.3).
 *
 * Fail-closed (19.4): ANY failure — no page/context, unreachable echo,
 * timeout, non-2xx, redirect, unparseable or non-IPv4 response, store
 * rejection — records NOTHING and returns { recorded: false, reason }.
 * A missing observation stays missing evidence downstream (the D3
 * warnings report not_measured for the profile); it is never replaced
 * by a manager-process value or a guess. This function never throws
 * for measurement failures, so callers can fire-and-forget it without
 * risking the launch flow.
 *
 * Echo endpoint contract (an LHM-controlled endpoint): GET returns
 * 200 with the caller's source address as JSON {"ip": "203.0.113.7"}
 * ({"remoteAddress": ...} is also accepted) or as bare text; it must
 * send `Access-Control-Allow-Origin: *` (the fetch runs in a page
 * context) and `Cache-Control: no-store`, and must not redirect.
 *
 * Scope: only sessions exposing a Playwright context/page (the
 * controller path). Sessions the app cannot drive (native-adapter or
 * manually opened browsers) have no page handle here and stay
 * NOT_RUN for this source — see agents/agent-7/INTEGRATION-NOTES.md.
 */
const net = require('net');

const SOURCE_RUNTIME = 'browser-runtime';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 30000;
const EVALUATE_GRACE_MS = 5000;
const MAX_ECHO_BODY = 4096;

/** Canonical IPv4 string, or null. Accepts the IPv6-mapped form
 *  ('::ffff:203.0.113.7') dual-stack servers report, normalised to the
 *  IPv4 the D3 layer supports. Anything else (incl. real IPv6) is null:
 *  the observation pipeline is IPv4-only by design. */
function canonicalIpv4(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (/^::ffff:/i.test(text)) text = text.slice('::ffff:'.length);
  return net.isIP(text) === 4 ? text : null;
}

/** Extract the observed IPv4 from an echo response body (text, or an
 *  already-parsed object). Returns null when the body carries no
 *  usable address. */
function parseEchoIp(body) {
  let candidate = null;
  if (body && typeof body === 'object') {
    candidate = body.ip || body.remoteAddress || null;
  } else if (typeof body === 'string') {
    const text = body.trim().slice(0, MAX_ECHO_BODY);
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        candidate = parsed && (parsed.ip || parsed.remoteAddress) || null;
      } catch (_) { candidate = null; }
    } else {
      candidate = text;
    }
  }
  return canonicalIpv4(candidate);
}

/**
 * Page-side probe. Self-contained on purpose: Playwright serialises
 * this function into the page, so it must not reference anything
 * outside its own body. The fetch carries an AbortController deadline;
 * redirects are refused (an echo endpoint must answer directly).
 */
async function probeEchoInPage({ url, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const text = await res.text();
    return { ok: true, text: text.slice(0, 4096) };
  } catch (error) {
    return {
      ok: false,
      reason: error && error.name === 'AbortError' ? 'timeout' : 'fetch-failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** page.evaluate with a Node-side deadline as a second guard: a wedged
 *  page must not hang the caller even if the in-page abort never runs. */
function evaluateWithTimeout(page, url, timeoutMs) {
  let timer = null;
  const deadline = new Promise(resolve => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: 'evaluate-timeout' }),
      timeoutMs + EVALUATE_GRACE_MS);
  });
  const probe = Promise.resolve()
    .then(() => page.evaluate(probeEchoInPage, { url, timeoutMs }))
    .catch(() => ({ ok: false, reason: 'evaluate-failed' }));
  return Promise.race([probe, deadline])
    .finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Observe the exit IP of a running profile from its own runtime.
 *
 * Options: { context?, page?, profileId, sessionId?, echoUrl, store?,
 * timeoutMs? }. Pass `page` to probe on an existing page (left open),
 * or `context` to open a temporary probe page in the profile's context
 * (closed afterwards). When `store` (an ExitIpObservationStore) is
 * supplied, a successful observation is recorded through it with
 * source 'browser-runtime'.
 *
 * Resolves to { recorded: true, source, entry } or
 * { recorded: false, source, reason }. Never rejects for measurement
 * failures.
 */
async function observeRuntimeExitIp(options = {}) {
  const fail = reason => ({ recorded: false, source: SOURCE_RUNTIME, reason });
  const { profileId, echoUrl, store = null } = options;
  const sessionId = typeof options.sessionId === 'string' && options.sessionId
    ? options.sessionId : null;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(Math.max(250, options.timeoutMs), MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  if (typeof profileId !== 'string' || !profileId)
    return fail('profile-id-required');
  let url;
  try { url = new URL(String(echoUrl)); } catch (_) { return fail('echo-url-invalid'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return fail('echo-url-invalid');
  // External IP measurements must be transported over authenticated HTTPS.
  // Only an explicit loopback address may use HTTP for local synthetic tests.
  if (url.protocol === 'http:' &&
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    return fail('echo-url-unsafe-transport');
  if (url.username || url.password || url.search || url.hash)
    return fail('echo-url-disallowed-components');

  let page = options.page || null;
  let ownPage = false;
  if (!page) {
    const context = options.context;
    if (!context || typeof context.newPage !== 'function')
      return fail('no-page-or-context');
    try { page = await context.newPage(); ownPage = true; }
    catch (_) { return fail('probe-page-failed'); }
  }
  try {
    if (!page || typeof page.evaluate !== 'function')
      return fail('page-unusable');
    const result = await evaluateWithTimeout(page, url.href, timeoutMs);
    if (!result || result.ok !== true)
      return fail(result && result.reason ? result.reason : 'echo-unreachable');
    const ip = parseEchoIp(result.text);
    if (!ip) return fail('echo-response-not-an-ip');
    const entry = {
      profileId, ip,
      observedAt: new Date().toISOString(),
      sessionId, source: SOURCE_RUNTIME,
    };
    if (store) {
      if (typeof store.record !== 'function') return fail('store-unusable');
      const saved = store.record({
        profileId, ip, sessionId, source: SOURCE_RUNTIME,
      });
      if (!saved) return fail('store-rejected-observation');
      return { recorded: true, source: SOURCE_RUNTIME, entry: saved };
    }
    return { recorded: true, source: SOURCE_RUNTIME, entry };
  } finally {
    if (ownPage && page) {
      try { await page.close(); } catch (_) { /* best-effort cleanup */ }
    }
  }
}

module.exports = {
  observeRuntimeExitIp,
  parseEchoIp,
  canonicalIpv4,
  SOURCE_RUNTIME,
  DEFAULT_TIMEOUT_MS,
};
