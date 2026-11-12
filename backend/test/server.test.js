import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

process.env.NODE_ENV = 'test';
process.env.DOMAIN_INSPECTION_ENABLED = 'true';
process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'true';
const { server } = await import('../src/server.js');

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
});

after(async () => {
  if (server.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

function baseUrl() {
  const address = server.address();
  return 'http://127.0.0.1:' + address.port;
}

test('fails closed when domain inspection is not explicitly enabled and attested', async () => {
  process.env.DOMAIN_INSPECTION_ENABLED = 'false';
  process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'false';
  const response = await fetch(baseUrl() + '/api/domain-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: 'example.com' })
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'DOMAIN_INSPECTION_DISABLED');
  process.env.DOMAIN_INSPECTION_ENABLED = 'true';
  process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'true';
});

test('keeps domain inspection disabled when running on Render despite both opt-in flags', async () => {
  const previousRender = process.env.RENDER;
  process.env.RENDER = 'true';
  process.env.DOMAIN_INSPECTION_ENABLED = 'true';
  process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'true';
  try {
    const response = await fetch(baseUrl() + '/api/domain-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'example.com' })
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'DOMAIN_INSPECTION_DISABLED');
  } finally {
    if (previousRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = previousRender;
    process.env.DOMAIN_INSPECTION_ENABLED = 'true';
    process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'true';
  }
});

test('uses the verified Cloudflare client IP for Render rate limits, not spoofable X-Forwarded-For', async () => {
  const previousRender = process.env.RENDER;
  process.env.RENDER = 'true';
  const base = baseUrl();
  const payload = JSON.stringify({
    subject: { type: 'business', name: 'Example Trading Ltd' },
    findings: [{
      claim: 'The business website publishes a contact page.',
      category: 'direct_observation',
      verificationState: 'unreviewed',
      sourceName: 'Business website',
      sourceUrl: 'https://example.com/contact'
    }]
  });
  try {
    for (let i = 0; i < 20; i += 1) {
      const response = await fetch(base + '/api/report', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': '198.51.100.50',
          'x-forwarded-for': '203.0.113.' + (i + 1)
        },
        body: payload
      });
      assert.equal(response.status, 200, 'request ' + (i + 1));
    }

    const limited = await fetch(base + '/api/report', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '198.51.100.50',
        'x-forwarded-for': '192.0.2.200'
      },
      body: payload
    });
    assert.equal(limited.status, 429);

    const separateClient = await fetch(base + '/api/report', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '198.51.100.51',
        'x-forwarded-for': '203.0.113.1'
      },
      body: payload
    });
    assert.equal(separateClient.status, 200);
  } finally {
    if (previousRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = previousRender;
  }
});

test('serves the interface and allowlisted static assets from one origin', async () => {
  const base = baseUrl();
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Follow the/);

  const script = await fetch(base + '/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.match(await script.text(), /textContent/);

  const css = await fetch(base + '/styles.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
});

test('returns safe errors for unsupported routes and invalid domain input', async () => {
  const base = baseUrl();
  const missing = await fetch(base + '/not-a-static-file');
  assert.equal(missing.status, 404);

  const invalid = await fetch(base + '/api/domain-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: '127.0.0.1' })
  });
  assert.equal(invalid.status, 400);
  const body = await invalid.json();
  assert.equal(body.error, 'DOMAIN_CHECK_FAILED');
});


test('builds evidence reports from supplied claims without claiming independent verification', async () => {
  const response = await fetch(baseUrl() + '/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: { type: 'business', name: 'Example Trading Ltd' },
      findings: [{
        claim: 'The business website publishes a contact page.',
        category: 'direct_observation',
        verificationState: 'unreviewed',
        sourceName: 'Business website',
        sourceUrl: 'https://example.com/contact'
      }]
    })
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.subject.name, 'Example Trading Ltd');
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].source.url, 'https://example.com/contact');
  assert.match(report.interpretation.statement, /not independently verified/);
  assert.ok(report.generatedAt);
});

test('accepts system-generated direct observations without inventing an external source URL', async () => {
  const response = await fetch(baseUrl() + '/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: { type: 'domain', name: 'example.com' },
      findings: [{
        claim: 'A record lookup returned an observation.',
        category: 'direct_observation',
        verificationState: 'unreviewed',
        sourceName: 'Tracelynt domain inspection',
        sourceUrl: '',
        notes: 'Point-in-time technical observation.'
      }]
    })
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.findings[0].source.url, null);
});

test('rejects unsafe source URLs in evidence reports', async () => {
  const response = await fetch(baseUrl() + '/api/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: { type: 'domain', name: 'example.com' },
      findings: [{
        claim: 'Test claim',
        category: 'analyst_assessment',
        verificationState: 'unreviewed',
        sourceName: 'Local service',
        sourceUrl: 'https://127.0.0.1/private'
      }]
    })
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'INVALID_REPORT');
});

test('enforces JSON content type and body limits while returning baseline security headers', async () => {
  const base = baseUrl();
  const missing = await fetch(base + '/not-a-static-file');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(missing.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(missing.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(missing.headers.get('referrer-policy'), 'no-referrer');

  const wrongType = await fetch(base + '/api/domain-check', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{"domain":"example.com"}'
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error, 'JSON_REQUIRED');

  const malformed = await fetch(base + '/api/domain-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"domain":'
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'DOMAIN_CHECK_FAILED');

  const oversized = await fetch(base + '/api/domain-check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain: 'x'.repeat(2048) })
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, 'DOMAIN_CHECK_FAILED');
});


test('does not serve path traversal or unlisted static-file requests', async () => {
  const base = baseUrl();
  for (const path of [
    '/.env',
    '/backend/package.json',
    '/app.js/../.env',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/..%2f..%2f.env'
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
    assert.equal((await response.json()).error, 'NOT_FOUND', path);
  }
});


test('configures bounded HTTP parser, request, keep-alive, and connection resources', () => {
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.requestTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
  assert.equal(server.maxRequestsPerSocket, 100);
  assert.equal(server.maxHeadersCount, 50);
  assert.equal(server.maxConnections, 100);
});

test('rejects oversized HTTP headers with 431 and closes the connection', async () => {
  const address = server.address();
  const rawResponse = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: address.port });
    let response = '';
    socket.setTimeout(3_000, () => socket.destroy(new Error('Header rejection timed out.')));
    socket.once('connect', () => {
      socket.write('GET /health HTTP/1.1\r\nHost: localhost\r\nX-Oversized: ' + 'a'.repeat(17 * 1024) + '\r\n\r\n');
    });
    socket.on('data', chunk => { response += chunk.toString('latin1'); });
    socket.once('end', () => resolve(response));
    socket.once('error', reject);
  });
  assert.match(rawResponse, /^HTTP\/1\.1 431 Request Header Fields Too Large/);
  assert.match(rawResponse, /Connection: close/i);
});
