import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientAddress } from '../src/client-address.js';

test('uses the Cloudflare client IP on Render and ignores X-Forwarded-For', () => {
  const request = {
    socket: { remoteAddress: '10.0.0.12' },
    headers: {
      'cf-connecting-ip': '203.0.113.8',
      'x-forwarded-for': '198.51.100.99, 10.0.0.12'
    }
  };
  assert.equal(getClientAddress(request, { RENDER: 'true' }), '203.0.113.8');
});

test('does not trust Cloudflare-specific headers outside Render', () => {
  const request = {
    socket: { remoteAddress: '192.0.2.10' },
    headers: { 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.99' }
  };
  assert.equal(getClientAddress(request, {}), '192.0.2.10');
});

test('uses a shared unknown bucket for missing, malformed, or multi-value Render headers', () => {
  for (const value of [undefined, '', 'not-an-ip', '203.0.113.8, 198.51.100.9', ['203.0.113.8']]) {
    assert.equal(getClientAddress({
      socket: { remoteAddress: '10.0.0.12' },
      headers: { 'cf-connecting-ip': value, 'x-forwarded-for': '203.0.113.8' }
    }, { RENDER: 'true' }), 'unknown');
  }
});

test('validates direct socket addresses and normalizes case', () => {
  assert.equal(getClientAddress({ socket: { remoteAddress: '2001:DB8::1' }, headers: {} }, {}), '2001:db8::1');
  assert.equal(getClientAddress({ socket: { remoteAddress: 'not-an-ip' }, headers: {} }, {}), 'unknown');
});
