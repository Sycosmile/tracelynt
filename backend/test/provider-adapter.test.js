import test from 'node:test';
import assert from 'node:assert/strict';
import { executeProviderAdapter } from '../src/provider-adapter.js';

const now = () => new Date('2026-11-12T10:00:00.000Z');
const success = {
  providerId: 'synthetic-provider',
  outcome: 'success',
  records: [{ value: 'synthetic-record' }],
  retrievedAt: '2026-11-12T09:59:00.000Z',
  sourcePublishedAt: null,
  freshness: 'current',
  errors: [],
  limitations: ['Synthetic test data only.']
};

test('executes an adapter and normalizes its provider result', async () => {
  let receivedSignal;
  const result = await executeProviderAdapter({
    id: 'synthetic-provider',
    async execute({ subject, signal }) {
      receivedSignal = signal;
      assert.deepEqual(subject, { type: 'domain', value: 'example.com' });
      return success;
    }
  }, { subject: { type: 'domain', value: 'example.com' }, now });

  assert.equal(result.outcome, 'success');
  assert.equal(result.providerId, 'synthetic-provider');
  assert.equal(receivedSignal.aborted, false);
});

test('aborts an adapter that exceeds its timeout and returns unavailable', async () => {
  let receivedSignal;
  const result = await executeProviderAdapter({
    id: 'synthetic-timeout',
    execute({ signal }) {
      receivedSignal = signal;
      return new Promise(() => {});
    }
  }, { timeoutMs: 10, now });

  assert.equal(receivedSignal.aborted, true);
  assert.equal(result.outcome, 'unavailable');
  assert.equal(result.errors[0].code, 'ADAPTER_TIMEOUT');
});

test('contains adapter exceptions without exposing provider error details', async () => {
  const result = await executeProviderAdapter({
    id: 'synthetic-failure',
    async execute() { throw new Error('secret=provider-token'); }
  }, { now });

  assert.equal(result.outcome, 'error');
  assert.equal(result.errors[0].code, 'ADAPTER_FAILED');
  assert.doesNotMatch(result.errors[0].message, /provider-token/);
});

test('rejects mismatched provider identity and malformed provider results', async () => {
  const mismatch = await executeProviderAdapter({
    id: 'synthetic-mismatch',
    async execute() { return { ...success, providerId: 'other-provider' }; }
  }, { now });
  assert.equal(mismatch.errors[0].code, 'ADAPTER_PROVIDER_MISMATCH');

  const malformed = await executeProviderAdapter({
    id: 'synthetic-malformed',
    async execute() { return { ...success, providerId: 'synthetic-malformed', outcome: 'not-an-outcome' }; }
  }, { now });
  assert.equal(malformed.errors[0].code, 'ADAPTER_INVALID_RESULT');
});

test('rejects invalid adapter contracts and timeout settings', async () => {
  await assert.rejects(() => executeProviderAdapter(null), /adapter must be an object/);
  await assert.rejects(() => executeProviderAdapter({ id: 'x' }), /execute function/);
  await assert.rejects(() => executeProviderAdapter({ id: '', execute() {} }), /adapter ID/);
  await assert.rejects(() => executeProviderAdapter({ id: 'x', execute() {} }, { timeoutMs: 30_001 }), /between 1 and 30000/);
});

test('limits concurrent work independently for each provider', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = {
    id: 'synthetic-concurrency',
    async execute() { await gate; return { ...success, providerId: 'synthetic-concurrency' }; }
  };
  const first = executeProviderAdapter(adapter, { now });
  const second = executeProviderAdapter(adapter, { now });
  // Let both adapter callbacks enter before submitting the excess request.
  await new Promise(resolve => setImmediate(resolve));
  const excess = await executeProviderAdapter(adapter, { now });
  assert.equal(excess.outcome, 'unavailable');
  assert.equal(excess.errors[0].code, 'ADAPTER_CAPACITY_EXCEEDED');
  release();
  assert.equal((await first).outcome, 'success');
  assert.equal((await second).outcome, 'success');
});

test('a timed-out non-cooperative adapter retains its slot until it settles', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = {
    id: 'synthetic-uncooperative',
    async execute() { await gate; return { ...success, providerId: 'synthetic-uncooperative' }; }
  };
  const first = await executeProviderAdapter(adapter, { timeoutMs: 10, now });
  assert.equal(first.errors[0].code, 'ADAPTER_TIMEOUT');

  const second = await executeProviderAdapter(adapter, { timeoutMs: 10, now });
  const third = await executeProviderAdapter(adapter, { timeoutMs: 10, now });
  assert.equal(second.errors[0].code, 'ADAPTER_TIMEOUT');
  assert.equal(third.errors[0].code, 'ADAPTER_CAPACITY_EXCEEDED');
  release();
});
