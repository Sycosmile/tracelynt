import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabasePoolOptions } from '../src/db-pool-config.js';

test('uses conservative bounded PostgreSQL pool defaults', () => {
  assert.deepEqual(getDatabasePoolOptions({}), {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: 'tracelynt-api'
  });
});

test('accepts configured pool sizes from one through twenty', () => {
  assert.equal(getDatabasePoolOptions({ DB_POOL_MAX: '1' }).max, 1);
  assert.equal(getDatabasePoolOptions({ DB_POOL_MAX: '20' }).max, 20);
});

test('rejects invalid, fractional, non-numeric, and excessive pool sizes', () => {
  for (const value of ['0', '-1', '21', '1.5', '2workers', 'NaN', ' 4']) {
    assert.throws(() => getDatabasePoolOptions({ DB_POOL_MAX: value }), /DB_POOL_MAX/);
  }
});
