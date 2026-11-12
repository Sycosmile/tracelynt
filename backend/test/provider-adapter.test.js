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

test('aborts an adapter that exceeds its timeout and returns an unavailable result', async () => {
  let receivedSignal;
  const result = await executeProviderAdapter({
    id: 'synthetic-provider',
    execute({ signal }) {
      receivedSignal = signal;
      return new Promise(() => {});
    }
  }, { timeoutMs: 10, now });

  assert.equal(receivedSignal.aborted, true);
  assert.equal(result.outcome, 'unavailable');
  assert.equal(result.errors[0].code, 'ADAPTER_TIMEOUT');
  assert.equal(result.errors[0].retryable, true);
});

test('contains adapter exceptions without exposing provider error details', async () => {
  const result = await executeProviderAdapter({
    id: 'synthetic-provider',
    async execute() { throw new Error('secret=provider-token'); }
  }, { now });

  assert.equal(result.outcome, 'error');
  assert.equal(result.errors[0].code, 'ADAPTER_FAILED');
  assert.doesNotMatch(result.errors[0].message, /provider-token/);
});

test('rejects mismatched provider identity and malformed provider results', async () => {
  const mismatch = await executeProviderAdapter({
    id: 'synthetic-provider',
    async execute() { return { ...success, providerId: 'other-provider' }; }
  }, { now });
  assert.equal(mismatch.errors[0].code, 'ADAPTER_PROVIDER_MISMATCH');

  const malformed = await executeProviderAdapter({
    id: 'synthetic-provider',
    async execute() { return { ...success, outcome: 'not-an-outcome' }; }
  }, { now });
  assert.equal(malformed.errors[0].code, 'ADAPTER_INVALID_RESULT');
});

test('rejects invalid adapter contracts and timeout settings', async () => {
  await assert.rejects(() => executeProviderAdapter(null), /adapter must be an object/);
  await assert.rejects(() => executeProviderAdapter({ id: 'x' }), /execute function/);
  await assert.rejects(() => executeProviderAdapter({ id: '', execute() {} }), /adapter ID/);
  await assert.rejects(() => executeProviderAdapter({ id: 'x', execute() {} }, { timeoutMs: 30_001 }), /between 1 and 30000/);
});
