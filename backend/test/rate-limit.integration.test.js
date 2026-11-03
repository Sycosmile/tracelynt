import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { consumeRateLimit } from '../src/rate-limit.js';

test('PostgreSQL rate limits are atomic across concurrent callers and persist across calls', { skip: !process.env.DATABASE_URL }, async () => {
  const key = 'integration-test:' + randomUUID();
  const pool = getPool();
  try {
    const decisions = await Promise.all(Array.from({ length: 25 }, () =>
      consumeRateLimit({ key, limit: 10, windowMs: 60_000, sharedStore: true })
    ));
    assert.equal(decisions.filter(item => item.allowed).length, 10);
    assert.equal(decisions.filter(item => !item.allowed).length, 15);
    for (const decision of decisions) {
      assert.ok(Number.isInteger(decision.retryAfter));
      assert.ok(decision.retryAfter >= 1 && decision.retryAfter <= 60);
    }

    const persisted = await consumeRateLimit({ key, limit: 10, windowMs: 60_000, sharedStore: true });
    assert.equal(persisted.allowed, false);

    const stored = await pool.query(
      'SELECT request_count, octet_length(key_hash) AS hash_length FROM rate_limit_buckets WHERE key_hash = $1',
      [createHashForTest(key)]
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].request_count, 26);
    assert.equal(stored.rows[0].hash_length, 32);
  } finally {
    await pool.query('DELETE FROM rate_limit_buckets WHERE key_hash = $1', [createHashForTest(key)]);
  }
});

test('PostgreSQL rate-limit windows reset at the next fixed-window boundary', { skip: !process.env.DATABASE_URL }, async () => {
  const key = 'window-test:' + randomUUID();
  const pool = getPool();
  try {
    const first = await consumeRateLimit({ key, limit: 1, windowMs: 1000, sharedStore: true });
    assert.equal(first.allowed, true);
    const second = await consumeRateLimit({ key, limit: 1, windowMs: 1000, sharedStore: true });
    assert.equal(second.allowed, false);
    await new Promise(resolve => setTimeout(resolve, first.retryAfter * 1000 + 100));
    const nextWindow = await consumeRateLimit({ key, limit: 1, windowMs: 1000, sharedStore: true });
    assert.equal(nextWindow.allowed, true);
  } finally {
    await pool.query('DELETE FROM rate_limit_buckets WHERE key_hash = $1', [createHashForTest(key)]);
  }
});

function createHashForTest(key) {
  return createHash('sha256').update('tracelynt-rate-limit:').update(key).digest();
}

test('local development limiter enforces its threshold without a database', async () => {
  const key = 'local-test:' + randomUUID();
  const first = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, sharedStore: false });
  const second = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, sharedStore: false });
  const third = await consumeRateLimit({ key, limit: 2, windowMs: 60_000, sharedStore: false });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfter >= 1);
});

test('shared production mode rejects decisions when PostgreSQL is unavailable', { skip: Boolean(process.env.DATABASE_URL) }, async () => {
  await assert.rejects(
    consumeRateLimit({ key: 'outage-test:' + randomUUID(), limit: 1, sharedStore: true }),
    /DATABASE_URL is required/
  );
});
