import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
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
