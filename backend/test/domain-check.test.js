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
