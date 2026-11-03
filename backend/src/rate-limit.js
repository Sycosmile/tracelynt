import { createHash } from 'node:crypto';
import { query } from './db.js';

const localWindows = new Map();
let cleanupCounter = 0;

function localDecision(key, limit, windowMs, now) {
  if (localWindows.size >= 5000) {
    for (const [entry, value] of localWindows) {
      if (now >= value.expiresAt) localWindows.delete(entry);
    }
    if (localWindows.size >= 5000) localWindows.delete(localWindows.keys().next().value);
  }
  const current = localWindows.get(key);
  if (!current || now >= current.expiresAt) {
    localWindows.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000) };
  }
  current.count += 1;
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
  };
}

export async function consumeRateLimit({ key, limit, windowMs = 60_000, now = Date.now(), sharedStore = process.env.NODE_ENV === 'production' }) {
  if (typeof key !== 'string' || !key || key.length > 1024) throw new TypeError('Rate-limit key must be non-empty text up to 1024 characters.');
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('Rate-limit limit must be a positive integer.');
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000 || windowMs > 3_600_000) throw new TypeError('Rate-limit window must be between 1 second and 1 hour.');

  if (!sharedStore) {
    return localDecision(key, limit, windowMs, now);
  }

  const keyHash = createHash('sha256').update('tracelynt-rate-limit:').update(key).digest();
  const seconds = Math.ceil(windowMs / 1000);
  const result = await query(
    `WITH clock AS (
       SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp()) / $2::numeric) * $2::numeric) AS starts_at
     )
     INSERT INTO rate_limit_buckets (key_hash, window_started_at, request_count, expires_at)
     SELECT $1, starts_at, 1, starts_at + ($2::integer * interval '1 second') FROM clock
     ON CONFLICT (key_hash) DO UPDATE
       SET window_started_at = EXCLUDED.window_started_at,
           request_count = CASE
             WHEN rate_limit_buckets.window_started_at = EXCLUDED.window_started_at
               THEN rate_limit_buckets.request_count + 1
             ELSE 1
           END,
           expires_at = EXCLUDED.expires_at
     RETURNING request_count,
       GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
         window_started_at + ($2::integer * interval '1 second') - clock_timestamp()
       )))::integer) AS retry_after`,
    [keyHash, seconds]
  );

  cleanupCounter += 1;
  if (cleanupCounter % 256 === 0) {
    await query(
      `DELETE FROM rate_limit_buckets
       WHERE key_hash IN (
         SELECT key_hash FROM rate_limit_buckets
         WHERE expires_at <= now()
         ORDER BY expires_at
         LIMIT 100
       )`
    );
  }

  const row = result.rows[0];
  if (!row) throw new Error('Rate-limit store returned no decision.');
  return {
    allowed: Number(row.request_count) <= limit,
    retryAfter: Math.min(seconds, Math.max(1, Number(row.retry_after)))
  };
}
