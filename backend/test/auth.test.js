import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';

process.env.APP_BASE_URL = 'http://127.0.0.1:8000';
process.env.AUTH_SECRET = 'test-only-auth-secret-that-is-long-enough';

const { assertCsrf, getCsrfToken, currentUser } = await import('../src/auth.js');

test('anonymous requests do not acquire a session or CSRF token', async () => {
  const request = { headers: {} };
  assert.equal(getCsrfToken(request), null);
  assert.equal(await currentUser(request), null);
});

test('CSRF validation rejects missing sessions, missing tokens, and foreign origins', () => {
  assert.throws(() => assertCsrf({ headers: { origin: 'http://127.0.0.1:8000' } }), /CSRF token required/);

  const token = randomBytes(32).toString('base64url');
  const csrfToken = createHmac('sha256', process.env.AUTH_SECRET)
    .update('tracelynt-csrf:')
    .update(token)
    .digest('base64url');
  const headers = {
    cookie: 'tracelynt_session=' + token,
    origin: 'https://attacker.example',
    'x-csrf-token': csrfToken
  };
  assert.throws(() => assertCsrf({ headers }), /Cross-origin request denied/);
  assert.throws(() => assertCsrf({ headers: { ...headers, origin: 'http://127.0.0.1:8000', 'x-csrf-token': 'wrong' } }), /CSRF token invalid/);
  assert.doesNotThrow(() => assertCsrf({
    headers: { ...headers, origin: 'http://127.0.0.1:8000', 'x-csrf-token': csrfToken }
  }));
});

test('server sessions reject expired, revoked, and suspended-account sessions', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const activeUser = randomUUID();
  const suspendedUser = randomUUID();
  const issuer = 'https://session-test.invalid';
  const activeSubject = randomUUID();
  const suspendedSubject = randomUUID();
  const validToken = randomBytes(32).toString('base64url');
  const expiredToken = randomBytes(32).toString('base64url');
  const revokedToken = randomBytes(32).toString('base64url');
  const suspendedToken = randomBytes(32).toString('base64url');
  const tokenHash = value => createHash('sha256').update(value).digest();

  try {
    await pool.query(
      "INSERT INTO users (id, oidc_issuer, oidc_subject, status) VALUES ($1, $3, $4, 'active'), ($2, $3, $5, 'suspended')",
      [activeUser, suspendedUser, issuer, activeSubject, suspendedSubject]
    );
    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '1 hour'), ($3, $2, now() - interval '2 hours', now() - interval '1 hour')",
      [tokenHash(validToken), activeUser, tokenHash(expiredToken)]
    );
    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at, revoked_at) VALUES ($1, $2, now() + interval '1 hour', now())",
      [tokenHash(revokedToken), activeUser]
    );
    await pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
      [tokenHash(suspendedToken), suspendedUser]
    );

    const requestFor = token => ({ headers: { cookie: 'tracelynt_session=' + token } });
    assert.equal((await currentUser(requestFor(validToken))).id, activeUser);
    assert.equal(await currentUser(requestFor(expiredToken)), null);
    assert.equal(await currentUser(requestFor(revokedToken)), null);
    assert.equal(await currentUser(requestFor(suspendedToken)), null);
  } finally {
    const users = [activeUser, suspendedUser];
    await pool.query('DELETE FROM sessions WHERE user_id = ANY($1::uuid[])', [users]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
  }
});
