import test from 'node:test';
import assert from 'node:assert/strict';
import { isDomainInspectionEnabled } from '../src/feature-flags.js';

test('domain inspection is disabled unless both explicit gates are true', () => {
  for (const env of [
    {},
    { DOMAIN_INSPECTION_ENABLED: 'true' },
    { DOMAIN_INSPECTION_EGRESS_VERIFIED: 'true' },
    { DOMAIN_INSPECTION_ENABLED: 'TRUE', DOMAIN_INSPECTION_EGRESS_VERIFIED: 'true' },
    { DOMAIN_INSPECTION_ENABLED: 'true', DOMAIN_INSPECTION_EGRESS_VERIFIED: '1' },
    { DOMAIN_INSPECTION_ENABLED: 'false', DOMAIN_INSPECTION_EGRESS_VERIFIED: 'true' }
  ]) assert.equal(isDomainInspectionEnabled(env), false);
});

test('domain inspection requires both exact true values', () => {
  assert.equal(isDomainInspectionEnabled({
    DOMAIN_INSPECTION_ENABLED: 'true',
    DOMAIN_INSPECTION_EGRESS_VERIFIED: 'true'
  }), true);
});
