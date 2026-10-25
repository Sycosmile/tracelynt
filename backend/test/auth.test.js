import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';

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
