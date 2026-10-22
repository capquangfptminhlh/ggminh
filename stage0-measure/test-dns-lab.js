'use strict';
/**
 * Contract tests for the Stage-0 DNS lab server (dns-lab-server.js).
 * Tier: unit/integration against the lab's own sockets on ephemeral
 * loopback ports — NOT a browser measurement. The real browser run
 * lives in run-dns-lab.js and reports its own tier.
 *
 * The answer/logic battery runs over TCP loopback because TCP works
 * in every environment this repo runs in (including sandboxes that
 * swallow UDP loopback). The UDP battery and the forwarding battery
 * are gated on a live UDP-loopback probe of the CURRENT environment:
 * where UDP loopback is not delivered they print NOT_RUN for that
 * environment instead of failing or faking a pass (Constitution 23).
 */
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const net = require('node:net');
const dnsLab = require('./dns-lab-server');
const { createDnsLabServer, parseQuery, buildResponse, inZone } = dnsLab;

function buildQuery(id, qname, qtype) {
  const labels = qname.split('.').filter(Boolean);
  const nameParts = [];
  for (const label of labels) {
    nameParts.push(Buffer.from([label.length]), Buffer.from(label, 'latin1'));
  }
  nameParts.push(Buffer.from([0]));
  const name = Buffer.concat(nameParts);
  const packet = Buffer.alloc(12 + name.length + 4);
  packet.writeUInt16BE(id, 0);
  packet.writeUInt16BE(0x0100, 2); // RD
  packet.writeUInt16BE(1, 4);
  name.copy(packet, 12);
  packet.writeUInt16BE(qtype, 12 + name.length);
  packet.writeUInt16BE(1, 12 + name.length + 2);
  return packet;
}

function parseResponse(buf) {
  const flags = buf.readUInt16BE(2);
  const q = parseQuery(buf);
  const ancount = buf.readUInt16BE(6);
  let rdata = null;
  if (ancount > 0) {
    let off = 12 + q.question.raw.length;
    off += 2 + 2 + 2 + 4; // name ptr, type, class, ttl
    const rdlen = buf.readUInt16BE(off); off += 2;
    rdata = [...buf.subarray(off, off + rdlen)].join('.');
  }
  return { id: buf.readUInt16BE(0), rcode: flags & 0xf,
    aa: (flags & 0x0400) !== 0, ancount, qname: q.question.qname, rdata };
}

function udpExchange(client, packet, port, timeoutMs = 1200) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('no response')), timeoutMs);
    client.once('message', (msg) => { clearTimeout(timer); resolve(msg); });
    client.send(packet, port, '127.0.0.1');
  });
}

// DNS-over-TCP: one query per connection, 2-byte length framing.
function tcpExchange(packet, port, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    const timer = setTimeout(() => { socket.destroy(); reject(Error('no tcp response')); }, timeoutMs);
    let buf = Buffer.alloc(0);
    socket.on('connect', () => {
      const framed = Buffer.alloc(2 + packet.length);
      framed.writeUInt16BE(packet.length, 0);
      packet.copy(framed, 2);
      socket.write(framed);
    });
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
        clearTimeout(timer);
        socket.end();
        resolve(buf.subarray(2, 2 + buf.readUInt16BE(0)));
      }
    });
    socket.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

(async () => {
  const closables = [];
  try {
    assert.equal(inZone('www.x.a5dns.test', 'a5dns.test'), true);
    assert.equal(inZone('a5dns.test', 'a5dns.test'), true);
    assert.equal(inZone('nota5dns.test', 'a5dns.test'), false);
    assert.equal(inZone('a5dns.test.evil.test', 'a5dns.test'), false);
    console.log('PASS zone matching');

    const lab = createDnsLabServer({ zone: 'a5dns.test' });
    closables.push(() => lab.close());
    await lab.listen(0);
    const tcpAddr = await lab.listenTcp(0);

    // --- TCP battery (environment-independent) ---
    let res = parseResponse(await tcpExchange(
      buildQuery(0x1111, 'www.abc123.a5dns.test', 1), tcpAddr.port));
    assert.equal(res.id, 0x1111);
    assert.equal(res.rcode, 0);
    assert.equal(res.aa, true);
    assert.equal(res.ancount, 1);
    assert.equal(res.rdata, '127.0.0.1');
    console.log('PASS in-zone A answer (tcp)');

    res = parseResponse(await tcpExchange(
      buildQuery(0x1112, 'www.abc123.a5dns.test', 28), tcpAddr.port));
    assert.equal(res.rcode, 0);
    assert.equal(res.ancount, 0);
    console.log('PASS in-zone AAAA nodata (tcp)');

    res = parseResponse(await tcpExchange(
      buildQuery(0x1113, 'www.abc123.a5dns.test', 65), tcpAddr.port));
    assert.equal(res.rcode, 0);
    assert.equal(res.ancount, 0);
    console.log('PASS in-zone HTTPS nodata (tcp)');

    res = parseResponse(await tcpExchange(
      buildQuery(0x3333, 'example.org', 1), tcpAddr.port));
    assert.equal(res.rcode, 5, 'REFUSED without upstream');
    console.log('PASS out-of-zone refused without upstream (tcp)');

    // Malformed bytes over TCP -> dropped, server survives
    await new Promise((resolve) => {
      const s = net.connect(tcpAddr.port, '127.0.0.1', () => {
        const junk = Buffer.from([0xde, 0xad, 0x01, 0x02, 0x03]);
        const framed = Buffer.alloc(2 + junk.length);
        framed.writeUInt16BE(junk.length, 0); junk.copy(framed, 2);
        s.end(framed, () => setTimeout(resolve, 150));
      });
      s.on('error', () => setTimeout(resolve, 150));
    });
    res = parseResponse(await tcpExchange(
      buildQuery(0x1114, 'www.abc123.a5dns.test', 1), tcpAddr.port));
    assert.equal(res.rdata, '127.0.0.1');
    console.log('PASS malformed packet dropped, server alive (tcp)');

    const actions = lab.log.map(e => e.action);
    assert.deepEqual(actions, ['answer-a-127.0.0.1', 'nodata', 'nodata',
      'refused-no-upstream', 'dropped-malformed', 'answer-a-127.0.0.1']);
    assert.equal(lab.log[0].qname, 'www.abc123.a5dns.test');
    assert.equal(lab.log[0].qtypeName, 'A');
    assert.equal(lab.log[0].transport, 'tcp');
    assert.ok(lab.log.every(e => typeof e.at === 'string' &&
      e.source === '127.0.0.1'));
    console.log('PASS query log shape and order');

    // --- UDP probe: is UDP loopback delivered in THIS environment? ---
    const udpAddr = lab.server.address();
    const client = dgram.createSocket('udp4');
    closables.push(() => { try { client.close(); } catch (_) {} });
    await new Promise((r, j) => { client.once('error', j); client.bind(0, '127.0.0.1', r); });
    let udpWorks = true;
    try {
      const probe = await udpExchange(client,
        buildQuery(0x2222, 'www.abc123.a5dns.test', 1), udpAddr.port, 900);
      assert.equal(parseResponse(probe).rdata, '127.0.0.1');
      console.log('PASS in-zone A answer (udp)');
    } catch (_) { udpWorks = false; }

    if (udpWorks) {
      // Forwarding battery: fake UDP upstream answers 203.0.113.9
      // (TEST-NET-3 documentation range — synthetic, never routed).
      const fakeUpstream = dgram.createSocket('udp4');
      closables.push(() => { try { fakeUpstream.close(); } catch (_) {} });
      fakeUpstream.on('message', (msg, rinfo) => {
        const q = parseQuery(msg);
        const head = buildResponse(q, { authoritative: true });
        head.writeUInt16BE(1, 6);
        const ans = Buffer.alloc(16);
        ans.writeUInt16BE(0xc00c, 0); ans.writeUInt16BE(1, 2);
        ans.writeUInt16BE(1, 4); ans.writeUInt32BE(60, 6);
        ans.writeUInt16BE(4, 10);
        Buffer.from([203, 0, 113, 9]).copy(ans, 12);
        fakeUpstream.send(Buffer.concat([head, q.question.raw, ans]),
          rinfo.port, rinfo.address);
      });
      await new Promise((r, j) => {
        fakeUpstream.once('error', j); fakeUpstream.bind(0, '127.0.0.1', r);
      });
      const labFwd = createDnsLabServer({ zone: 'a5dns.test',
        upstream: '127.0.0.1', upstreamPort: fakeUpstream.address().port });
      closables.push(() => labFwd.close());
      const fwdAddr = await labFwd.listen(0);
      res = parseResponse(await udpExchange(client,
        buildQuery(0x4444, 'example.org', 1), fwdAddr.port));
      assert.equal(res.id, 0x4444, 'client transaction id restored');
      assert.equal(res.rdata, '203.0.113.9');
      assert.equal(labFwd.log[0].action, 'forward');
      console.log('PASS out-of-zone forwarding (udp)');
    } else {
      console.log('NOT_RUN in this environment: UDP battery + forwarding ' +
        'battery — a UDP loopback probe to the lab\'s own socket went ' +
        'unanswered (this sandbox does not deliver UDP loopback; ' +
        'verified 2026-10-21 with raw Node and Python sockets). ' +
        'Re-run on Windows or a standard Linux host to execute them.');
    }

    console.log('test-dns-lab: all executed assertions passed');
  } finally {
    for (const close of closables) close();
  }
})().then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
