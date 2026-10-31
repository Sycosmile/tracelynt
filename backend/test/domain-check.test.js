import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, isPublicIp, inspectDomain } from '../src/domain-check.js';

test('normalizes case, trailing dot, and internationalized domain names', () => {
  assert.equal(normalizeDomain(' Example.COM. '), 'example.com');
  assert.equal(normalizeDomain('bücher.de'), 'xn--bcher-kva.de');
});

test('rejects URLs, IP literals, local domains, and malformed labels', () => {
  for (const value of [
    'https://example.com/path', '127.0.0.1', 'localhost', 'service.local',
    'bad..example.com', 'example.com:443', 'user@example.com', 'example.com\\@127.0.0.1',
    'example.com\\\\evil.test', 'example.com?next=127.0.0.1', '-bad.example.com',
    'bad-.example.com', 'a'.repeat(64) + '.example.com', 'service.internal',
    'service.test', 'service.onion', 'service.example'
  ]) assert.throws(() => normalizeDomain(value), undefined, value);
});

test('allows representative public addresses', () => {
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('1.1.1.1'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
});

test('blocks private, loopback, link-local, documentation, and special-use IPs', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '192.0.2.10', '192.168.1.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.5', '224.0.0.1', '240.0.0.1', '::1', 'fc00::1', 'fe80::1',
    '2001:db8::1', '2002::1', '3fff::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254',
    '2001:4860:4860::8888%eth0'
  ]) assert.equal(isPublicIp(address), false, address);
});

test('returns DNS observations and TLS metadata with provenance limitations', async () => {
  const resolver = {
    resolve4: async () => ['8.8.8.8'],
    resolve6: async () => { const error = new Error('no data'); error.code = 'ENODATA'; throw error; },
    resolveMx: async () => [{ exchange: 'mail.example.com', priority: 10 }],
    resolveTxt: async () => [['v=spf1', ' -all']]
  };
  const result = await inspectDomain('example.com', {
    resolver,
    tlsCheck: async (ip, domain) => ({ status: 'ok', authorized: true, protocol: 'TLSv1.3', testedAddress: ip, serverName: domain })
  });
  assert.equal(result.domain, 'example.com');
  assert.equal(result.checks.dns.ipv4.records[0], '8.8.8.8');
  assert.equal(result.checks.dns.mx.records[0].priority, 10);
  assert.equal(result.checks.dns.txt.records[0], 'v=spf1 -all');
  assert.equal(result.checks.tls.authorized, true);
  assert.ok(result.retrievedAt);
  assert.ok(result.limitations.length >= 1);
  assert.equal(result.providerResults.length, 5);
  assert.equal(result.providerResults[0].providerId, 'dns-a');
  assert.equal(result.providerResults[0].outcome, 'success');
  assert.equal(result.providerResults[0].records[0], '8.8.8.8');
  assert.equal(result.providerResults[1].outcome, 'no_records');
  assert.equal(result.providerResults[0].retrievedAt, result.retrievedAt);
  assert.equal(result.observations.length, 5);
  assert.equal(result.observations[0].subject.value, 'example.com');
  assert.equal(result.observations[0].provenance.kind, 'system');
  assert.equal(result.observations[0].retrievedAt, result.retrievedAt);
  assert.match(result.observations[0].claim, /DNS IPv4 check result/);
});

test('blocks a domain if any resolved address is non-public', async () => {
  const resolver = {
    resolve4: async () => ['8.8.8.8', '127.0.0.1'],
    resolve6: async () => [],
    resolveMx: async () => [],
    resolveTxt: async () => []
  };
  await assert.rejects(
    inspectDomain('example.com', { resolver, tlsCheck: async () => ({ status: 'ok' }) }),
    /non-public or special-use/
  );
});

test('does not start TLS when DNS returns only non-public IPv6 addresses', async () => {
  const resolver = {
    resolve4: async () => [],
    resolve6: async () => ['::1'],
    resolveMx: async () => [],
    resolveTxt: async () => []
  };
  let tlsCalled = false;
  await assert.rejects(inspectDomain('example.com', {
    resolver,
    tlsCheck: async () => { tlsCalled = true; return { status: 'ok' }; }
  }), /non-public or special-use/);
  assert.equal(tlsCalled, false);
});

test('distinguishes a missing DNS name from a record type with no records', async () => {
  const resolver = {
    resolve4: async () => { const error = new Error('name not found'); error.code = 'ENOTFOUND'; throw error; },
    resolve6: async () => { const error = new Error('no data'); error.code = 'ENODATA'; throw error; },
    resolveMx: async () => { const error = new Error('no data'); error.code = 'ENODATA'; throw error; },
    resolveTxt: async () => { const error = new Error('no data'); error.code = 'ENODATA'; throw error; }
  };
  const result = await inspectDomain('example.com', { resolver });
  assert.equal(result.checks.dns.ipv4.status, 'error');
  assert.equal(result.checks.dns.ipv4.error, 'DNS_NAME_NOT_FOUND');
  assert.equal(result.checks.dns.ipv6.status, 'no_records');
  assert.equal(result.observations[0].reviewState, 'unavailable');
  assert.equal(result.observations[1].reviewState, 'unreviewed');
  assert.equal(result.providerResults[0].outcome, 'unavailable');
  assert.equal(result.providerResults[0].errors[0].code, 'DNS_NAME_NOT_FOUND');
  assert.equal(result.providerResults[1].outcome, 'no_records');
});

test('rejects additional special-use IPv4 and IPv6 ranges used in SSRF attempts', () => {
  for (const address of [
    '0.1.2.3',
    '100.127.255.255',
    '192.0.0.8',
    '192.0.2.255',
    '198.19.255.255',
    '198.51.100.255',
    '203.0.113.255',
    '255.255.255.255',
    '::',
    '::ffff:8.8.8.8',
    '2001:db8:ffff::1',
    '2001:20::1',
    '2002:0808:0808::1',
    '3fff:0fff:ffff::1',
    '2001:4860:4860::8888%eth0'
  ]) assert.equal(isPublicIp(address), false, address);
});

test('blocks TLS when public IPv4 coexists with a special-use IPv6 answer', async () => {
  const resolver = {
    resolve4: async () => ['8.8.8.8'],
    resolve6: async () => ['fe80::1'],
    resolveMx: async () => [],
    resolveTxt: async () => []
  };
  let tlsCalled = false;
  await assert.rejects(inspectDomain('example.com', {
    resolver,
    tlsCheck: async () => {
      tlsCalled = true;
      return { status: 'ok' };
    }
  }), /non-public or special-use/);
  assert.equal(tlsCalled, false);
});

test('does not attempt TLS when DNS has no public IPv4 address', async () => {
  const resolver = {
    resolve4: async () => [],
    resolve6: async () => ['2606:4700:4700::1111'],
    resolveMx: async () => [],
    resolveTxt: async () => []
  };
  let tlsCalled = false;
  const result = await inspectDomain('example.com', {
    resolver,
    tlsCheck: async () => {
      tlsCalled = true;
      return { status: 'ok' };
    }
  });
  assert.equal(tlsCalled, false);
  assert.equal(result.checks.tls.status, 'skipped');
  assert.equal(result.providerResults[4].outcome, 'unavailable');
});



test('bounds DNS resolver latency and preserves other provider results', async () => {
  const resolver = {
    resolve4: async () => ['8.8.8.8'],
    resolve6: async () => new Promise(() => {}),
    resolveMx: async () => [{ exchange: 'mail.example.com', priority: 10 }],
    resolveTxt: async () => []
  };
  const result = await inspectDomain('example.com', {
    resolver, dnsTimeoutMs: 50,
    tlsCheck: async () => ({ status: 'ok', authorized: true })
  });
  assert.equal(result.checks.dns.ipv6.status, 'error');
  assert.equal(result.checks.dns.ipv6.error, 'DNS_TIMEOUT');
  assert.equal(result.checks.dns.ipv4.records[0], '8.8.8.8');
  assert.equal(result.checks.dns.mx.status, 'ok');
  assert.equal(result.overallOutcome, 'partial');
  assert.equal(result.providerResults[1].outcome, 'unavailable');
});

test('uses the safe default DNS timeout for out-of-range configuration', async () => {
  const resolver = {
    resolve4: async () => ['8.8.8.8'], resolve6: async () => [],
    resolveMx: async () => [], resolveTxt: async () => []
  };
  const result = await inspectDomain('example.com', {
    resolver, dnsTimeoutMs: 1, tlsCheck: async () => ({ status: 'ok' })
  });
  assert.equal(result.checks.dns.ipv4.status, 'ok');
});


test('rejects additional IPv4 special-use boundaries and IPv6 transition or translation addresses', () => {
  for (const address of [
    '100.64.0.0', '100.127.255.255', '192.0.0.0', '192.0.0.255',
    '192.88.99.1', '192.175.48.1', '198.18.0.0', '198.19.255.255',
    '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255',
    '::', '::1', '::ffff:0:0', '64:ff9b::7f00:1', '100::1',
    '2001::1', '2001:2::1', '2001:10::1', '2001:20::1',
    '2002::1', '3fff:0fff:ffff::1', 'fe80::1%eth0'
  ]) assert.equal(isPublicIp(address), false, address);
});

test('rejects a mixed public and special-use DNS answer set before any TLS connection', async () => {
  for (const answers of [
    { v4: ['8.8.8.8'], v6: ['::ffff:127.0.0.1'] },
    { v4: ['1.1.1.1', '169.254.169.254'], v6: [] },
    { v4: [], v6: ['2606:4700:4700::1111', 'fc00::1'] }
  ]) {
    let tlsCalled = false;
    await assert.rejects(inspectDomain('example.com', {
      resolver: {
        resolve4: async () => answers.v4,
        resolve6: async () => answers.v6,
        resolveMx: async () => [],
        resolveTxt: async () => []
      },
      tlsCheck: async () => { tlsCalled = true; return { status: 'ok' }; }
    }), /non-public or special-use/);
    assert.equal(tlsCalled, false);
  }
});
