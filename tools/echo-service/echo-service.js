'use strict';
/**
 * LHM runtime-egress echo service — reference implementation.
 *
 * The app's runtime exit-IP observation (src/health/runtimeEgressObservation.js)
 * is deliberately config-gated on `settings.runtimeEchoUrl`: the module
 * defines the client contract but chooses no endpoint, because WHO runs
 * the endpoint is an owner decision (see docs/agents/agent-10 and
 * agent-r10 notes). This service is the LHM-operated option the owner
 * can deploy: a dependency-free Node.js (stdlib-only) HTTPS service
 * that satisfies the client contract exactly:
 *
 *   GET /            -> 200 {"ip": "<caller IPv4>"}   (also GET /ip)
 *   Headers:         Access-Control-Allow-Origin: *
 *                    Cache-Control: no-store
 *                    Content-Type: application/json; charset=utf-8
 *   Never redirects, never sets cookies, never returns HTML.
 *
 * Fail-closed pairing: if this service is down, slow, or answers
 * anything unexpected, the app records NOTHING (the client refuses
 * redirects, non-2xx, and non-IPv4 bodies). An outage therefore costs
 * missing evidence downstream, never wrong evidence.
 *
 * Transport security: the service refuses to start in plain HTTP
 * unless ECHO_ALLOW_HTTP=1 is set explicitly — and that mode exists
 * ONLY for (a) loopback lab use and (b) binding to 127.0.0.1 behind a
 * same-host TLS-terminating reverse proxy (Caddy/nginx). Never bind
 * plain HTTP to a public interface: the response is an observation the
 * app trusts, and a plain-HTTP path lets an on-path attacker rewrite
 * it. Production is HTTPS, either directly (ECHO_TLS_CERT/ECHO_TLS_KEY
 * pointing at e.g. Let's Encrypt files) or via the reverse proxy.
 *
 * Privacy shape (see the security review in
 * docs/agents/agent-r10/INTEGRATION-NOTES.md): the client sends a bare
 * GET with credentials omitted and no identifier of any kind — no
 * profile id, no license token, no cookie. The service learns only
 * "this source address asked at this time", which is the minimum an
 * echo service can possibly learn. Logging is one line per request
 * (time, observed address, method, path without query, status) and
 * can be disabled with ECHO_LOG=off; retention is an operations
 * decision documented in DEPLOY.md (recommended maximum 7 days).
 *
 * Rate limiting: fixed-window per source address (defaults: 60
 * requests per 60 s), excess answered 429 with Retry-After. Counters
 * are in-memory only; a restart resets them, which is acceptable for
 * an abuse brake (it is not a security boundary).
 *
 * Configuration (environment only; nothing is hardcoded):
 *   ECHO_PORT          listen port (default 8443)
 *   ECHO_HOST          bind address (default 0.0.0.0; use 127.0.0.1
 *                      behind a same-host reverse proxy)
 *   ECHO_TLS_CERT      PEM certificate chain file -> HTTPS mode
 *   ECHO_TLS_KEY       PEM private key file       -> HTTPS mode
 *   ECHO_ALLOW_HTTP    '1' permits plain HTTP (lab / loopback-proxy
 *                      topologies only; startup prints a warning)
 *   ECHO_TRUST_PROXY   '1' honours X-Forwarded-For (first entry) —
 *                      ONLY when a same-host reverse proxy that sets
 *                      the header is actually in front; enabling it
 *                      on a directly exposed service lets any caller
 *                      spoof their observed address
 *   ECHO_RATE_MAX      requests per window per address (default 60)
 *   ECHO_RATE_WINDOW_MS  window length (default 60000)
 *   ECHO_LOG           'off' disables request logging (default on)
 */
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const net = require('node:net');

const ECHO_PATHS = new Set(['/', '/ip']);

function loadConfig(env = process.env) {
  const int = (name, fallback) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    port: int('ECHO_PORT', 8443),
    host: env.ECHO_HOST || '0.0.0.0',
    tlsCertFile: env.ECHO_TLS_CERT || null,
    tlsKeyFile: env.ECHO_TLS_KEY || null,
    allowHttp: env.ECHO_ALLOW_HTTP === '1',
    trustProxy: env.ECHO_TRUST_PROXY === '1',
    rateMax: int('ECHO_RATE_MAX', 60),
    rateWindowMs: int('ECHO_RATE_WINDOW_MS', 60000),
    log: env.ECHO_LOG !== 'off',
  };
}

/** Transport mode for a config: 'https' | 'http' | throws. Exported so
 *  tests can pin the fail-closed refusal without spawning a process. */
function resolveMode(config) {
  if (config.tlsCertFile && config.tlsKeyFile) return 'https';
  if (config.tlsCertFile || config.tlsKeyFile)
    throw new Error('ECHO_TLS_CERT and ECHO_TLS_KEY must be set together');
  if (config.allowHttp) return 'http';
  throw new Error(
    'Refusing to start: no TLS configured. Set ECHO_TLS_CERT/ECHO_TLS_KEY ' +
    '(HTTPS), put a TLS-terminating proxy in front (see DEPLOY.md), or set ' +
    'ECHO_ALLOW_HTTP=1 for loopback lab use only.');
}

/** Normalise a socket/forwarded address to a canonical IPv4 string.
 *  Accepts the IPv6-mapped form dual-stack servers report. Returns
 *  null for real IPv6 and garbage: the observation pipeline is
 *  IPv4-only by design, and a non-IPv4 caller must produce no IPv4
 *  claim (the client fails closed on a null ip). */
function callerIpv4(address) {
  if (typeof address !== 'string') return null;
  let text = address.trim();
  if (/^::ffff:/i.test(text)) text = text.slice('::ffff:'.length);
  return net.isIP(text) === 4 ? text : null;
}

/** The address an observation is about, and the rate-limit key. With
 *  trustProxy on, the first X-Forwarded-For entry wins (the socket
 *  peer is the proxy itself); an unparseable header falls back to the
 *  socket address rather than trusting garbage. */
function callerAddress(req, trustProxy) {
  if (trustProxy) {
    const xff = req.headers && req.headers['x-forwarded-for'];
    const first = typeof xff === 'string' ? xff.split(',')[0].trim() : '';
    if (first && net.isIP(first)) return first;
  }
  return req.socket && req.socket.remoteAddress || '';
}

function createEchoServer(config, { logger = console.log, onRequest = null } = {}) {
  const mode = resolveMode(config);
  const windows = new Map(); // rate key -> { windowStart, count }
  const MAX_RATE_KEYS = 10000;

  function rateLimited(key, now) {
    let entry = windows.get(key);
    if (!entry || now - entry.windowStart >= config.rateWindowMs) {
      entry = { windowStart: now, count: 0 };
      windows.set(key, entry);
      if (windows.size > MAX_RATE_KEYS) {
        // Bound memory under address churn: drop the oldest window.
        windows.delete(windows.keys().next().value);
      }
    }
    entry.count += 1;
    return entry.count > config.rateMax;
  }

  function handle(req, res) {
    const started = Date.now();
    const raw = callerAddress(req, config.trustProxy);
    const ip = callerIpv4(raw);
    const pathOnly = String(req.url || '').split('?')[0];
    let status = 200;
    const finish = () => {
      if (typeof onRequest === 'function') {
        try { onRequest({ ip, address: raw, method: req.method, path: pathOnly, status }); } catch (_) {}
      }
      if (config.log) {
        logger(`${new Date().toISOString()} ${ip || raw || '-'} ${req.method} ${pathOnly} ${status} ${Date.now() - started}ms`);
      }
    };
    const sendJson = (code, body, extraHeaders = {}) => {
      status = code;
      const payload = JSON.stringify(body);
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': Buffer.byteLength(payload),
        ...extraHeaders,
      });
      res.end(req.method === 'HEAD' ? undefined : payload);
      finish();
    };

    if (req.method === 'OPTIONS') {
      status = 204;
      res.writeHead(204, {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Content-Length': '0',
      });
      res.end();
      finish();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(405, { error: 'method-not-allowed' }, { Allow: 'GET, HEAD, OPTIONS' });
      return;
    }
    if (!ECHO_PATHS.has(pathOnly)) {
      sendJson(404, { error: 'not-found' });
      return;
    }
    if (rateLimited(raw || '-', started)) {
      const retryAfter = Math.max(1, Math.ceil(config.rateWindowMs / 1000));
      sendJson(429, { error: 'rate-limited' }, { 'Retry-After': String(retryAfter) });
      return;
    }
    if (ip) { sendJson(200, { ip }); return; }
    // Caller reached us over IPv6 (or an address we cannot classify):
    // answer honestly with no IPv4 claim. The client treats a null ip
    // as unusable evidence and records nothing — by design.
    sendJson(200, { ip: null, addressFamily: net.isIP(raw) === 6 ? 'IPv6' : 'unknown' });
  }

  let server;
  if (mode === 'https') {
    server = https.createServer({
      cert: fs.readFileSync(config.tlsCertFile),
      key: fs.readFileSync(config.tlsKeyFile),
      minVersion: 'TLSv1.2',
    }, handle);
  } else {
    server = http.createServer(handle);
  }
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  return { server, mode };
}

function main() {
  const config = loadConfig();
  let created;
  try {
    created = createEchoServer(config);
  } catch (error) {
    console.error('echo-service: ' + error.message);
    process.exitCode = 2;
    return;
  }
  const { server, mode } = created;
  server.once('error', error => {
    console.error('echo-service: listen failed: ' + error.message);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    const addr = server.address();
    console.log(`echo-service: listening on ${mode}://${config.host}:${addr.port} ` +
      `(trustProxy=${config.trustProxy ? 'on' : 'off'}, rate=${config.rateMax}/${config.rateWindowMs}ms, log=${config.log ? 'on' : 'off'})`);
    if (mode === 'http')
      console.log('echo-service: WARNING plain HTTP — loopback lab or same-host TLS proxy only, never a public bind.');
    if (config.trustProxy)
      console.log('echo-service: WARNING X-Forwarded-For is trusted — only safe behind a same-host proxy that sets it.');
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) main();

module.exports = { createEchoServer, loadConfig, resolveMode, callerIpv4, callerAddress, ECHO_PATHS };
