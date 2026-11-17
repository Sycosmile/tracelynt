import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProviderResult } from '../src/provider-result.js';

const base = {
  providerId: 'public-dns',
  outcome: 'success',
  records: [{ address: '203.0.113.10' }],
  retrievedAt: '2026-10-28T10:00:00.000Z',
  freshness: 'current',
  errors: [],
  limitations: ['Point-in-time result; does not establish ownership.']
};

test('normalizes a successful provider result and preserves limitations', () => {
  const result = normalizeProviderResult(base);
  assert.equal(result.schemaVersion, '1.0');
  assert.equal(result.outcome, 'success');
  assert.deepEqual(result.records, base.records);
  assert.notEqual(result.records, base.records);
  assert.equal(result.retrievedAt, base.retrievedAt);
  assert.equal(result.freshness, 'current');
  assert.match(result.limitations[0], /does not establish ownership/);
});

test('keeps empty, partial, unavailable, and failed outcomes distinct', () => {
  assert.equal(normalizeProviderResult({ ...base, outcome: 'no_records', records: [] }).outcome, 'no_records');
  assert.equal(normalizeProviderResult({ ...base, outcome: 'partial', errors: [{ code: 'TIMEOUT', message: 'Secondary query timed out', retryable: true }] }).outcome, 'partial');
  assert.equal(normalizeProviderResult({ ...base, outcome: 'unavailable', records: [] }).outcome, 'unavailable');
  assert.equal(normalizeProviderResult({ ...base, outcome: 'error', records: [] }).outcome, 'error');
});

test('requires consistent record semantics for success, empty, and partial outcomes', () => {
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'success', records: [] }), /use no_records/);
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'no_records', records: base.records }), /cannot contain records/);
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'partial', records: [] }), /usable record/);
});

test('requires explicit retry guidance for rate limits', () => {
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'rate_limited', records: [] }), /must specify retryAfterSeconds/);
  assert.equal(normalizeProviderResult({ ...base, outcome: 'rate_limited', records: [], retryAfterSeconds: 0 }).retryAfterSeconds, 0);
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'rate_limited', records: [], retryAfterSeconds: 86401 }), /between 0 and 86400/);
});

test('rejects invalid outcomes, timestamps, and malformed errors', () => {
  assert.throws(() => normalizeProviderResult({ ...base, outcome: 'verified' }), /not supported/);
  assert.throws(() => normalizeProviderResult({ ...base, retrievedAt: '2026-02-30T10:00:00Z' }), /valid timestamp/);
  assert.throws(() => normalizeProviderResult({ ...base, errors: [{ code: '', message: 'bad' }] }), /Error code/);
  assert.throws(() => normalizeProviderResult({ ...base, freshness: 'forever' }), /Freshness state/);
});

test('bounds record count and optional source publication time', () => {
  assert.equal(normalizeProviderResult({ ...base, sourcePublishedAt: null }).sourcePublishedAt, null);
  assert.throws(() => normalizeProviderResult({ ...base, records: Array(101).fill({}) }), /at most 100/);
  assert.throws(() => normalizeProviderResult({ ...base, limitations: [''] }), /Limitation 1/);
});

test('rejects non-object provider records', () => {
  for (const record of [null, 42, true, []]) {
    assert.throws(() => normalizeProviderResult({ ...base, records: [record] }), /Record 1 must be a string or object/);
  }
  assert.deepEqual(normalizeProviderResult({ ...base, records: [{ id: 'record-1' }] }).records, [{ id: 'record-1' }]);
  assert.deepEqual(normalizeProviderResult({ ...base, records: ['203.0.113.10'] }).records, ['203.0.113.10']);
});

test('rejects oversized individual and aggregate provider records', () => {
  assert.throws(() => normalizeProviderResult({
    ...base, records: [{ value: 'x'.repeat(16 * 1024) }]
  }), /maximum serialized size|string that is too large/);
  assert.throws(() => normalizeProviderResult({
    ...base, records: Array(20).fill({ value: 'x'.repeat(3500) })
  }), /aggregate serialized size/);
});

test('rejects deeply nested, oversized, circular, and non-JSON provider values', () => {
  let nested = 'leaf';
  for (let index = 0; index < 9; index += 1) nested = { child: nested };
  assert.throws(() => normalizeProviderResult({ ...base, records: [nested] }), /nesting depth/);

  const circular = {};
  circular.self = circular;
  assert.throws(() => normalizeProviderResult({ ...base, records: [circular] }), /circular/);
  assert.throws(() => normalizeProviderResult({ ...base, records: [{ value: Number.NaN }] }), /finite numbers/);
  assert.throws(() => normalizeProviderResult({ ...base, records: [{ value: undefined }] }), /JSON-compatible/);
});

test('rejects accessor properties and prototype-sensitive keys without invoking accessors', () => {
  let invoked = false;
  const accessor = {};
  Object.defineProperty(accessor, 'value', { enumerable: true, get() { invoked = true; return 'unsafe'; } });
  assert.throws(() => normalizeProviderResult({ ...base, records: [accessor] }), /data properties/);
  assert.equal(invoked, false);

  const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => normalizeProviderResult({ ...base, records: [unsafe] }), /prohibited object key/);
});
