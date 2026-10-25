import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { inspectDomain } from './domain-check.js';
import { createEvidenceReport } from './report.js';
import { appOrigin, assertCsrf, beginLogin, completeLogin, currentUser, getCsrfToken, loginBinding, logout } from './auth.js';
import { routeCaseRequest } from './cases.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '8000', 10);
const BODY_LIMIT = 2048;
const REPORT_BODY_LIMIT = 96_000;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 20;
const rateWindows = new Map();
const STATIC_FILES = new Map([
  ['/', { file: new URL('../../frontend/index.html', import.meta.url), type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: new URL('../../frontend/index.html', import.meta.url), type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: new URL('../../frontend/styles.css', import.meta.url), type: 'text/css; charset=utf-8' }],
  ['/app.js', { file: new URL('../../frontend/app.js', import.meta.url), type: 'text/javascript; charset=utf-8' }]
]);

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'referrer-policy': 'no-referrer'
  });
  response.end(JSON.stringify(body));
}

function allowedByRateLimit(address, limit = REQUESTS_PER_WINDOW) {
  const now = Date.now();
  if (rateWindows.size > 5000) {
    for (const [key, value] of rateWindows) {
      if (now - value.startedAt >= WINDOW_MS) rateWindows.delete(key);
    }
  }
  const current = rateWindows.get(address);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateWindows.set(address, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

async function readJson(request, limit = BODY_LIMIT) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

export const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (request.method === 'GET' && STATIC_FILES.has(pathname)) {
    try {
      const asset = STATIC_FILES.get(pathname);
      const content = await readFile(asset.file);
      response.writeHead(200, {
        'content-type': asset.type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer'
      });
      return response.end(content);
    } catch {
      return send(response, 500, { error: 'ASSET_UNAVAILABLE' });
    }
  }
  if (request.method === 'GET' && pathname === '/health') {
    return send(response, 200, { status: 'ok', service: 'tracelynt-domain-api' });
  }
  if (request.method === 'GET' && pathname === '/auth/login') {
    if (!allowedByRateLimit((request.socket.remoteAddress || 'unknown') + ':auth', 10)) return send(response, 429, { error: 'RATE_LIMITED' });
    try {
      const login = await beginLogin();
      response.writeHead(302, { location: login.url, 'set-cookie': login.setCookie, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      return response.end();
    } catch {
      return send(response, 503, { error: 'AUTH_NOT_CONFIGURED', message: 'Sign-in is not configured. Set the OIDC and database environment variables.' });
    }
  }
  if (request.method === 'GET' && pathname === '/auth/callback') {
    if (!allowedByRateLimit((request.socket.remoteAddress || 'unknown') + ':auth', 10)) return send(response, 429, { error: 'RATE_LIMITED' });
    try {
      const incomingUrl = new URL(request.url || '/auth/callback', appOrigin());
      if (incomingUrl.pathname !== '/auth/callback') return send(response, 400, { error: 'LOGIN_FAILED' });
      const callbackUrl = new URL('/auth/callback', appOrigin());
      callbackUrl.search = incomingUrl.search;
      const result = await completeLogin(callbackUrl.href, loginBinding(request));
      response.writeHead(302, { location: '/', 'set-cookie': result.setCookies, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      return response.end();
    } catch (error) {
      const status = error.statusCode || 401;
      return send(response, status, { error: 'LOGIN_FAILED', message: status < 500 ? error.message : 'Sign-in could not be completed.' });
    }
  }
  if (request.method === 'GET' && pathname === '/api/session') {
    try {
      const user = await currentUser(request);
      return send(response, 200, user
        ? { authenticated: true, csrfToken: getCsrfToken(request) }
        : { authenticated: false });
    } catch {
      return send(response, 503, { error: 'WORKSPACE_UNAVAILABLE' });
    }
  }
  if (request.method === 'POST' && pathname === '/auth/logout') {
    try {
      assertCsrf(request);
      const cookies = await logout(request);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'set-cookie': cookies, 'x-content-type-options': 'nosniff' });
      return response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      return send(response, error.statusCode || 503, { error: error.code || 'LOGOUT_FAILED' });
    }
  }
  if (pathname === '/api/cases' || pathname.startsWith('/api/cases/')) {
    if (!allowedByRateLimit((request.socket.remoteAddress || 'unknown') + ':workspace', 120)) return send(response, 429, { error: 'RATE_LIMITED' });
    try {
      const user = await currentUser(request);
      if (!user) return send(response, 401, { error: 'UNAUTHENTICATED' });
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method || '')) return send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
      const isMutation = request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE';
      if (isMutation) assertCsrf(request);
      let body;
      if (isMutation) {
        if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
          return send(response, 415, { error: 'JSON_REQUIRED' });
        }
        body = await readJson(request, REPORT_BODY_LIMIT);
      }
      const result = await routeCaseRequest({ method: request.method, pathname, body, userId: user.id });
      if (!result) return send(response, 404, { error: 'NOT_FOUND' });
      return send(response, result.status, result.body);
    } catch (error) {
      const status = error.statusCode || (error.code === 'CSRF_DENIED' ? 403 : 503);
      return send(response, status, { error: error.code || (status === 403 ? 'CSRF_DENIED' : 'WORKSPACE_UNAVAILABLE'), ...(status === 400 ? { message: error.message } : {}) });
    }
  }
  const isDomainCheck = request.method === 'POST' && pathname === '/api/domain-check';
  const isReport = request.method === 'POST' && pathname === '/api/report';
  if (!isDomainCheck && !isReport) return send(response, 404, { error: 'NOT_FOUND' });
  const address = request.socket.remoteAddress || 'unknown';
  if (!allowedByRateLimit(address)) return send(response, 429, { error: 'RATE_LIMITED' });
  if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return send(response, 415, { error: 'JSON_REQUIRED' });
  }
  try {
    const body = await readJson(request, isReport ? REPORT_BODY_LIMIT : BODY_LIMIT);
    if (isReport) {
      try {
        return send(response, 200, createEvidenceReport(body));
      } catch (error) {
        return send(response, 400, { error: 'INVALID_REPORT', message: error.message || 'Report input is invalid.' });
      }
    }
    if (!body || typeof body.domain !== 'string') {
      return send(response, 400, { error: 'INVALID_INPUT', message: 'Provide a domain string.' });
    }
    const result = await inspectDomain(body.domain);
    return send(response, 200, result);
  } catch (error) {
    const status = error.statusCode || 400;
    const message = status === 413 || status === 400 ? error.message : 'Request failed.';
    return send(response, status, { error: 'DOMAIN_CHECK_FAILED', message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    process.stdout.write('Tracelynt domain API listening on ' + HOST + ':' + PORT + '\n');
  });
}
