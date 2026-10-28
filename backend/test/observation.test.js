import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservation } from '../src/observation.js';

const valid = {
  id: 'obs-001',
  subject: { type: 'domain', value: 'example.com' },
  claim: 'A DNS lookup returned 8.8.8.8 for the domain at retrieval time.',
  category: 'direct_observation',
  source: { name: 'Tracelynt DNS inspection' },
  retrievedAt: '2026-10-28T10:00:00.000Z',
  observedAt: '2026-10-28T10:00:00Z',
  reviewState: 'unreviewed',
  freshness: { state: 'current', asOf: '2026-10-28T10:00:00Z' },
  provenance: { kind: 'system' },
  limitations: ['Point-in-time observation; does not establish domain ownership.']
};

test('normalizes a provenance-rich observation with explicit limitations', () => {
  const result = normalizeObservation(valid);
  assert.equal(result.schemaVersion, '1.0');
  assert.equal(result.subject.value, 'example.com');
  assert.equal(result.retrievedAt, '2026-10-28T10:00:00.000Z');
  assert.equal(result.observedAt, '2026-10-28T10:00:00.000Z');
  assert.equal(result.reviewState, 'unreviewed');
  assert.equal(result.freshness.state, 'current');
  assert.equal(result.provenance.kind, 'system');
  assert.match(result.limitations[0], /does not establish/);
});

test('requires a source, provenance, subject, and retrieval timestamp', () => {
  for (const input of [
    { ...valid, source: undefined },
    { ...valid, provenance: undefined },
    { ...valid, subject: undefined },
    { ...valid, retrievedAt: undefined }
  ]) assert.throws(() => normalizeObservation(input));
});

test('rejects unsupported categories, review states, and freshness labels', () => {
  assert.throws(() => normalizeObservation({ ...valid, category: 'magic' }), /category is not supported/);
  assert.throws(() => normalizeObservation({ ...valid, reviewState: 'verified_forever' }), /Review state is not supported/);
  assert.throws(() => normalizeObservation({ ...valid, freshness: { state: 'perfect' } }), /Freshness state is not supported/);
});

test('rejects unsafe or misleading source URLs', () => {
  for (const url of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://127.0.0.1/private',
    'https://localhost/admin',
    'https://service.internal/data',
    'https://example.invalid'
  ]) assert.throws(() => normalizeObservation({ ...valid, source: { name: 'Test source', url } }), undefined, url);
});

test('rejects impossible calendar dates instead of normalizing them', () => {
  for (const timestamp of [
    '2026-02-30T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-10-28T25:00:00Z',
    '2026-10-28T10:61:00Z'
  ]) {
    assert.throws(() => normalizeObservation({ ...valid, retrievedAt: timestamp }), /valid timestamp/, timestamp);
  }
});

test('rejects IPv6 literals as public source hostnames', () => {
  assert.throws(
    () => normalizeObservation({ ...valid, source: { name: 'Test source', url: 'https://[2606:4700:4700::1111]/' } }),
    /named public hostname/
  );
});

test('distinguishes missing observation time from missing retrieval time', () => {
  const result = normalizeObservation({ ...valid, observedAt: null });
  assert.equal(result.observedAt, null);
  assert.throws(() => normalizeObservation({ ...valid, retrievedAt: null }), /Retrieved time must be an ISO 8601 UTC timestamp/);
});

test('rejects malformed limitation lists and excessive limits', () => {
  assert.throws(() => normalizeObservation({ ...valid, limitations: 'not an array' }), /Limitations must be an array/);
  assert.throws(() => normalizeObservation({ ...valid, limitations: Array(21).fill('limit') }), /Limitations must be an array/);
  assert.throws(() => normalizeObservation({ ...valid, limitations: [''] }), /Limitation 1 is missing/);
});
