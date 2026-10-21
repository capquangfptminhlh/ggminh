'use strict';
/**
 * Minimal authoritative DNS server for the Stage-0 DNS lab
 * (Constitution 4.1 DNS row, 19.3, 23). Node standard library only
 * (`dgram`); the DNS wire format is parsed/built by hand below.
 *
 * Behaviour:
 *  - Names inside the lab zone (default `a5dns.test`) are answered
 *    authoritatively: A -> 127.0.0.1, every other qtype -> NODATA
 *    (NOERROR, zero answers). The zone is a wildcard: any name under
 *    the apex resolves, so a run can mint unique subdomains freely.
 *  - Names outside the zone are forwarded to an optional upstream
 *    resolver (transaction-id remapped) and the upstream response is
 *    relayed; without an upstream they are refused (REFUSED). This
 *    keeps a host whose resolv.conf points at the lab functional
 *    during a run, and makes out-of-zone lookups visible in the log
 *    instead of silently failing.
 *  - EVERY query is logged as one JSON object:
 *    {at, source, sourcePort, id, qname, qtype, qtypeName, rd,
 *     zone: 'lab'|'external', action} — the observation record the
 *    Constitution's DNS row requires ("controlled domain +
 *    resolution log"). The lab only OBSERVES resolution; it makes
 *    no judgement about any address (19.1/19.2).
 *
 * Standalone use:
 *   node dns-lab-server.js            # binds 127.0.0.1:53 (root)
 *   LHM_DNS_LAB_PORT=5353 LHM_DNS_LAB_UPSTREAM=198.19.0.1 \
 *     LHM_DNS_LAB_LOG=/tmp/dns.jsonl node dns-lab-server.js
 */
const dgram = require('node:dgram');
const net = require('node:net');

const QTYPE_NAMES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR',
  15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 65: 'HTTPS', 255: 'ANY' };
const RCODE = { NOERROR: 0, FORMERR: 1, SERVFAIL: 2, NXDOMAIN: 3,
  NOTIMP: 4, REFUSED: 5 };

function parseName(buf, offset) {
  const labels = [];
  let off = offset;
  let jumped = false;
  let end = -1;
  for (let guard = 0; guard < 128; guard++) {
    if (off >= buf.length) return null;
    const len = buf[off];
    if (len === 0) { if (!jumped) end = off + 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (off + 1 >= buf.length) return null;
      const ptr = ((len & 0x3f) << 8) | buf[off + 1];
      if (!jumped) end = off + 2;
      jumped = true;
      off = ptr;
      continue;
    }
    if ((len & 0xc0) !== 0) return null;
    if (off + 1 + len > buf.length) return null;
    labels.push(buf.toString('latin1', off + 1, off + 1 + len));
    off += 1 + len;
  }
  return { name: labels.join('.').toLowerCase(), end };
}

function parseQuery(buf) {
  if (!buf || buf.length < 12) return null;
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const qdcount = buf.readUInt16BE(4);
  if (qdcount < 1) return { id, flags, qdcount, question: null };
  const parsed = parseName(buf, 12);
  if (!parsed || parsed.end + 4 > buf.length) return null;
  const qtype = buf.readUInt16BE(parsed.end);
  const qclass = buf.readUInt16BE(parsed.end + 2);
  return {
    id, flags, qdcount,
    rd: (flags & 0x0100) !== 0,
    opcode: (flags >> 11) & 0xf,
    question: {
      qname: parsed.name, qtype, qclass,
      raw: buf.subarray(12, parsed.end + 4),
    },
  };
}

function buildResponse(query, { rcode = 0, authoritative = false,
  aRecords = [] } = {}) {
  const answers = aRecords.map(() => {
    const rec = Buffer.alloc(16);
    rec.writeUInt16BE(0xc00c, 0);      // name: pointer to question
    rec.writeUInt16BE(1, 2);           // type A
    rec.writeUInt16BE(1, 4);           // class IN
    rec.writeUInt32BE(60, 6);          // TTL 60s
    rec.writeUInt16BE(4, 10);          // rdlength
    Buffer.from([127, 0, 0, 1]).copy(rec, 12);
    return rec;
  });
  const header = Buffer.alloc(12);
  header.writeUInt16BE(query.id, 0);
  let flags = 0x8000 | (query.rd ? 0x0100 : 0) | 0x0080 | (rcode & 0xf);
  if (authoritative) flags |= 0x0400;
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(answers.length, 6);
  return Buffer.concat([header, query.question.raw, ...answers]);
}

function inZone(qname, zone) {
  return qname === zone || qname.endsWith('.' + zone);
}

function createDnsLabServer({ zone = 'a5dns.test', upstream = null,
  upstreamPort = 53, onLog = null } = {}) {
  const log = [];
  const record = (entry) => {
    log.push(entry);
    if (onLog) onLog(entry);
  };
  const server = dgram.createSocket('udp4');
  const upstreamSocket = dgram.createSocket('udp4');
  const pending = new Map(); // upstreamId -> {reply, query, timer}
  let tcpServer = null;
  const tcpSockets = new Set();

  upstreamSocket.on('message', (msg) => {
    if (msg.length < 2) return;
    const upId = msg.readUInt16BE(0);
    const slot = pending.get(upId);
    if (!slot) return;
    pending.delete(upId);
    clearTimeout(slot.timer);
    const out = Buffer.from(msg);
    out.writeUInt16BE(slot.query.id, 0);
    slot.reply(out);
  });

  // One handler for both transports: `reply(buf)` delivers a raw DNS
  // message back over whichever transport the query arrived on, and
  // `transport` is recorded so a run can tell UDP from TCP arrivals.
  // (Authoritative DNS must serve TCP as well as UDP; some resolver
  // configurations — e.g. glibc `options use-vc` — only speak TCP.)
  function handlePacket(msg, source, transport, reply) {
    const at = new Date().toISOString();
    const query = parseQuery(msg);
    if (!query || !query.question) {
      record({ at, source: source.address, sourcePort: source.port,
        transport, id: query ? query.id : null, qname: null, qtype: null,
        qtypeName: null, rd: null, zone: null, action: 'dropped-malformed' });
      return; // a malformed packet gets no reply and must not kill the lab
    }
    const { qname, qtype } = query.question;
    const base = { at, source: source.address, sourcePort: source.port,
      transport, id: query.id, qname, qtype,
      qtypeName: QTYPE_NAMES[qtype] || 'TYPE' + qtype, rd: query.rd };
    if (query.opcode !== 0) {
      record({ ...base, zone: null, action: 'notimp' });
      reply(buildResponse(query, { rcode: RCODE.NOTIMP }));
      return;
    }
    if (inZone(qname, zone)) {
      if (qtype === 1) {
        record({ ...base, zone: 'lab', action: 'answer-a-127.0.0.1' });
        reply(buildResponse(query, { authoritative: true, aRecords: [1] }));
      } else {
        record({ ...base, zone: 'lab', action: 'nodata' });
        reply(buildResponse(query, { authoritative: true }));
      }
      return;
    }
    if (!upstream) {
      record({ ...base, zone: 'external', action: 'refused-no-upstream' });
      reply(buildResponse(query, { rcode: RCODE.REFUSED }));
      return;
    }
    let upId = Math.floor(Math.random() * 0x10000);
    while (pending.has(upId)) upId = (upId + 1) & 0xffff;
    const timer = setTimeout(() => {
      if (!pending.delete(upId)) return;
      record({ ...base, zone: 'external', action: 'forward-timeout-servfail' });
      reply(buildResponse(query, { rcode: RCODE.SERVFAIL }));
    }, 3000);
    pending.set(upId, { reply, query, timer });
    const fwd = Buffer.from(msg);
    fwd.writeUInt16BE(upId, 0);
    record({ ...base, zone: 'external', action: 'forward' });
    upstreamSocket.send(fwd, upstreamPort, upstream);
  }

  server.on('message', (msg, rinfo) => {
    handlePacket(msg, { address: rinfo.address, port: rinfo.port }, 'udp',
      (buf) => server.send(buf, rinfo.port, rinfo.address));
  });

  return {
    log, server,
    listen(port, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.bind(port, host, () => resolve(server.address()));
      });
    },
    // TCP DNS uses a 2-byte length prefix per message (RFC 1035 4.2.2).
    listenTcp(port, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        tcpServer = net.createServer((socket) => {
          tcpSockets.add(socket);
          socket.on('close', () => tcpSockets.delete(socket));
          socket.on('error', () => {});
          let buf = Buffer.alloc(0);
          socket.on('data', (chunk) => {
            buf = Buffer.concat([buf, chunk]);
            while (buf.length >= 2) {
              const len = buf.readUInt16BE(0);
              if (buf.length < 2 + len) break;
              const packet = buf.subarray(2, 2 + len);
              buf = buf.subarray(2 + len);
              const remote = { address: socket.remoteAddress,
                port: socket.remotePort };
              handlePacket(packet, remote, 'tcp', (resp) => {
                const framed = Buffer.alloc(2 + resp.length);
                framed.writeUInt16BE(resp.length, 0);
                resp.copy(framed, 2);
                if (!socket.destroyed) socket.write(framed);
              });
            }
          });
        });
        tcpServer.once('error', reject);
        tcpServer.listen(port, host, () => resolve(tcpServer.address()));
      });
    },
    close() {
      for (const slot of pending.values()) clearTimeout(slot.timer);
      pending.clear();
      for (const s of tcpSockets) s.destroy();
      if (tcpServer) try { tcpServer.close(); } catch (_) {}
      try { server.close(); } catch (_) {}
      try { upstreamSocket.close(); } catch (_) {}
    },
  };
}

if (require.main === module) {
  const fs = require('node:fs');
  const logFile = process.env.LHM_DNS_LAB_LOG || null;
  const lab = createDnsLabServer({
    zone: process.env.LHM_DNS_LAB_ZONE || 'a5dns.test',
    upstream: process.env.LHM_DNS_LAB_UPSTREAM || null,
    onLog: (entry) => {
      const line = JSON.stringify(entry);
      if (logFile) fs.appendFileSync(logFile, line + '\n');
      else console.log(line);
    },
  });
  const port = Number(process.env.LHM_DNS_LAB_PORT || 53);
  Promise.all([lab.listen(port), lab.listenTcp(port)])
    .then(([udpAddr, tcpAddr]) => {
      console.error(`dns-lab listening udp=${udpAddr.address}:${udpAddr.port} ` +
        `tcp=${tcpAddr.address}:${tcpAddr.port} ` +
        `zone=${process.env.LHM_DNS_LAB_ZONE || 'a5dns.test'} ` +
        `upstream=${process.env.LHM_DNS_LAB_UPSTREAM || '(none)'}`);
    }).catch((e) => { console.error(e); process.exitCode = 1; });
}

module.exports = { createDnsLabServer, parseQuery, buildResponse,
  inZone, QTYPE_NAMES, RCODE };
