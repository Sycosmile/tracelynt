import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCaseRequest } from '../src/cases.js';

test('case domain-observation import cannot bypass the domain-inspection release gate', async () => {
  const previousEnabled = process.env.DOMAIN_INSPECTION_ENABLED;
  const previousAttestation = process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED;
  process.env.DOMAIN_INSPECTION_ENABLED = 'false';
  process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'false';
  let inspectorCalled = false;
  try {
    const result = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/00000000-0000-4000-8000-000000000001/import-domain-observations',
      body: { domain: 'example.com' },
      userId: 'test-user',
      domainInspector: async () => { inspectorCalled = true; throw new Error('must not run'); }
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.error, 'DOMAIN_INSPECTION_DISABLED');
    assert.equal(inspectorCalled, false);
  } finally {
    if (previousEnabled === undefined) delete process.env.DOMAIN_INSPECTION_ENABLED;
    else process.env.DOMAIN_INSPECTION_ENABLED = previousEnabled;
    if (previousAttestation === undefined) delete process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED;
    else process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = previousAttestation;
  }
});
