import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { server } = await import('../src/server.js');

test('serves the interface and allowlisted static assets from one origin', async t => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;
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
  const address = server.address();
  const base = 'http://127.0.0.1:' + address.port;
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
