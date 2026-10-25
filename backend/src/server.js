import http from 'node:http';
import { inspectDomain } from './domain-check.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '8000', 10);
const BODY_LIMIT = 2048;
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 20;
const rateWindows = new Map();

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

function allowedByRateLimit(address) {
  const now = Date.now();
  const current = rateWindows.get(address);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateWindows.set(address, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > BODY_LIMIT) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
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
  if (request.method === 'GET' && pathname === '/health') {
    return send(response, 200, { status: 'ok', service: 'tracelynt-domain-api' });
  }
  if (request.method !== 'POST' || pathname !== '/api/domain-check') {
    return send(response, 404, { error: 'NOT_FOUND' });
  }
  const address = request.socket.remoteAddress || 'unknown';
  if (!allowedByRateLimit(address)) return send(response, 429, { error: 'RATE_LIMITED' });
  if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return send(response, 415, { error: 'JSON_REQUIRED' });
  }
  try {
    const body = await readJson(request);
    if (!body || typeof body.domain !== 'string') {
      return send(response, 400, { error: 'INVALID_INPUT', message: 'Provide a domain string.' });
    }
    const result = await inspectDomain(body.domain);
    return send(response, 200, result);
  } catch (error) {
    const status = error.statusCode || (String(error.message).includes('non-public') ? 400 : 400);
    const message = status === 413 || status === 400 ? error.message : 'Request failed.';
    return send(response, status, { error: 'DOMAIN_CHECK_FAILED', message });
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    process.stdout.write('Tracelynt domain API listening on ' + HOST + ':' + PORT + '\n');
  });
}
