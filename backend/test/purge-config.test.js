import test from 'node:test';
import assert from 'node:assert/strict';
import { getPurgeConfig } from '../src/purge-config.js';

test('pending-case purge defaults to read-only dry-run', () => {
  assert.deepEqual(getPurgeConfig({}), { dryRun: true });
  assert.deepEqual(getPurgeConfig({ PURGE_DRY_RUN: 'true' }), { dryRun: true });
});

test('pending-case purge rejects ambiguous dry-run settings', () => {
  for (const value of ['yes', 'no', '1', '0', 'TRUE', 'false ']) {
    assert.throws(
      () => getPurgeConfig({ PURGE_DRY_RUN: value }),
      /PURGE_DRY_RUN must be exactly true or false/
    );
  }
});

test('destructive pending-case purge requires explicit confirmation', () => {
  assert.throws(
    () => getPurgeConfig({ PURGE_DRY_RUN: 'false' }),
    /CONFIRM_PURGE_PENDING_CASES=YES/
  );
  assert.deepEqual(
    getPurgeConfig({ PURGE_DRY_RUN: 'false', CONFIRM_PURGE_PENDING_CASES: 'YES' }),
    { dryRun: false }
  );
});
