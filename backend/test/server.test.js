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
