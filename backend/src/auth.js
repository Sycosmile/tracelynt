import {
  createHash, createHmac, randomBytes, timingSafeEqual
} from 'node:crypto';
import * as oidc from 'openid-client';
import { query } from './db.js';

const SESSION_TTL_SECONDS = 12 * 60 * 60;
const LOGIN_TTL_SECONDS = 10 * 60;
const SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-tracelynt_session'
  : 'tracelynt_session';
const BINDING_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-tracelynt_login'
  : 'tracelynt_login';

let oidcConfigPromise;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is not configured.');
  return value;
}

function baseUrl() {
  const url = new URL(requiredEnv('APP_BASE_URL'));
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_BASE_URL must use HTTPS in production.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_BASE_URL must be an origin without a path, query, or fragment.');
  }
  return url.origin;
}

function oidcConfig() {
  if (!oidcConfigPromise) {
    oidcConfigPromise = oidc.discovery(
      new URL(requiredEnv('OIDC_ISSUER')),
      requiredEnv('OIDC_CLIENT_ID'),
      requiredEnv('OIDC_CLIENT_SECRET')
    ).catch((error) => {
      oidcConfigPromise = undefined;
      throw error;
    });
  }
  return oidcConfigPromise;
}

function hash(value) {
  return createHash('sha256').update(value).digest();
}

function cookieValue(request, name) {
  const header = request.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function cookie(name, value, options = {}) {
  const parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push('Max-Age=' + options.maxAge);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  if (options.clear) parts.push('Max-Age=0');
  return parts.join('; ');
}

export function clearAuthCookies() {
  return [
    cookie(SESSION_COOKIE, '', { clear: true }),
    cookie(BINDING_COOKIE, '', { clear: true })
  ];
}

function csrfFor(sessionToken) {
  return createHmac('sha256', requiredEnv('AUTH_SECRET'))
    .update('tracelynt-csrf:')
    .update(sessionToken)
    .digest('base64url');
}

export function getCsrfToken(request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  return csrfFor(token);
}

export function assertCsrf(request) {
  const expectedOrigin = baseUrl();
  const origin = request.headers.origin;
  const referer = request.headers.referer;
  let refererOrigin = null;
  try { if (referer) refererOrigin = new URL(referer).origin; } catch {}
  if ((origin && origin !== expectedOrigin) || (!origin && refererOrigin !== expectedOrigin)) {
    throw Object.assign(new Error('Cross-origin request denied.'), { statusCode: 403, code: 'CSRF_DENIED' });
  }
  const sessionToken = cookieValue(request, SESSION_COOKIE);
  const supplied = request.headers['x-csrf-token'];
  if (!sessionToken || typeof supplied !== 'string') {
    throw Object.assign(new Error('CSRF token required.'), { statusCode: 403, code: 'CSRF_DENIED' });
  }
  const expected = Buffer.from(csrfFor(sessionToken));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw Object.assign(new Error('CSRF token invalid.'), { statusCode: 403, code: 'CSRF_DENIED' });
  }
}

export async function beginLogin() {
  const config = await oidcConfig();
  const origin = baseUrl();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const verifier = oidc.randomPKCECodeVerifier();
  const challenge = await oidc.calculatePKCECodeChallenge(verifier);
  const browserBinding = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LOGIN_TTL_SECONDS * 1000);

  await query(
    'DELETE FROM oidc_login_transactions WHERE expires_at <= now()'
  );
  await query(
    'INSERT INTO oidc_login_transactions (state_hash, browser_binding_hash, nonce, pkce_verifier, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [hash(state), hash(browserBinding), nonce, verifier, expiresAt]
  );

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: origin + '/auth/callback',
    scope: 'openid email',
    response_type: 'code',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  return { url: authorizationUrl.href, setCookie: cookie(BINDING_COOKIE, browserBinding, { maxAge: LOGIN_TTL_SECONDS }) };
}

export async function completeLogin(requestUrl, browserBinding) {
  if (!browserBinding) throw Object.assign(new Error('Login transaction missing.'), { statusCode: 400 });
  const url = new URL(requestUrl);
  const state = url.searchParams.get('state');
  if (!state || url.searchParams.has('error')) {
    throw Object.assign(new Error('Identity provider did not complete login.'), { statusCode: 400 });
  }

  const result = await query(
    'DELETE FROM oidc_login_transactions WHERE state_hash = $1 AND browser_binding_hash = $2 AND expires_at > now() RETURNING nonce, pkce_verifier',
    [hash(state), hash(browserBinding)]
  );
  if (result.rowCount !== 1) {
    throw Object.assign(new Error('Login transaction expired or did not match this browser.'), { statusCode: 400 });
  }

  const transaction = result.rows[0];
  const config = await oidcConfig();
  const tokens = await oidc.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: transaction.pkce_verifier,
    expectedState: state,
    expectedNonce: transaction.nonce
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string' || !claims.sub || typeof claims.iss !== 'string' || !claims.iss) {
    throw Object.assign(new Error('Identity provider returned incomplete identity claims.'), { statusCode: 401 });
  }
  const configuredIssuer = new URL(requiredEnv('OIDC_ISSUER')).href.replace(/\/$/, '');
  const returnedIssuer = new URL(claims.iss).href.replace(/\/$/, '');
  if (configuredIssuer !== returnedIssuer) {
    throw Object.assign(new Error('Identity provider issuer mismatch.'), { statusCode: 401 });
  }

  const userResult = await query(
    'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $2, $3) ON CONFLICT (oidc_issuer, oidc_subject) DO UPDATE SET updated_at = now() RETURNING id, status',
    [randomBytes(16).toString('hex').replace(/^/, ''), claims.iss, claims.sub]
  ).catch(async (error) => {
    // The UUID is generated by PostgreSQL below if the supplied value was not accepted.
    throw error;
  });
  const user = userResult.rows[0];
  if (!user || user.status !== 'active') {
    throw Object.assign(new Error('This account is not permitted to sign in.'), { statusCode: 403 });
  }

  const sessionToken = randomBytes(32).toString('base64url');
  await query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 * interval \'1 second\'))',
    [hash(sessionToken), user.id, SESSION_TTL_SECONDS]
  );
  await query(
    "INSERT INTO audit_events (id, actor_user_id, action, resource_type, outcome) VALUES ($1, $2, 'login', 'session', 'success')",
    [randomUuid(), user.id]
  );
  return {
    setCookies: [
      cookie(SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_SECONDS }),
      cookie(BINDING_COOKIE, '', { clear: true })
    ]
  };
}

function randomUuid() {
  return [
    randomBytes(4).toString('hex'),
    randomBytes(2).toString('hex'),
    '4' + randomBytes(2).toString('hex').slice(1),
    ((8 + (randomBytes(1)[0] & 3)).toString(16)) + randomBytes(2).toString('hex').slice(1, 3),
    randomBytes(6).toString('hex')
  ].join('-');
}

export async function currentUser(request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || token.length < 40 || token.length > 64) return null;
  const result = await query(
    'SELECT u.id, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()',
    [hash(token)]
  );
  if (result.rowCount !== 1 || result.rows[0].status !== 'active') return null;
  return { id: result.rows[0].id, csrfToken: csrfFor(token) };
}

export async function logout(request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    await query(
      'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hash(token)]
    );
  }
  return clearAuthCookies();
}

export function loginBinding(request) {
  return cookieValue(request, BINDING_COOKIE);
}

export function appOrigin() {
  return baseUrl();
}
