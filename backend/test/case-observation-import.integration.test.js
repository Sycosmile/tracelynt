import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';

test('normalized observations import only into an owned matching open case', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const issuer = 'https://tracelynt-observation-import-test.invalid';
  const caseId = randomUUID();
  const observation = {
    subject: { type: 'domain', value: 'example.com' },
    claim: 'Synthetic DNS observation for integration testing.',
    category: 'provider_data',
    source: { name: 'Synthetic DNS provider', url: 'https://dns.google/resolve', providerId: 'synthetic-dns' },
    retrievedAt: '2026-10-29T10:00:00.000Z',
    observedAt: '2026-10-29T09:55:00.000Z',
    sourcePublishedAt: null,
    reviewState: 'unreviewed',
    freshness: { state: 'unknown', asOf: null },
    provenance: { kind: 'provider', actorId: 'synthetic-adapter' },
    limitations: ['Synthetic data; not a real domain assessment.']
  };

  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $3, $4), ($2, $3, $5)',
      [ownerId, otherId, issuer, randomUUID(), randomUUID()]
    );
    await pool.query(
      "INSERT INTO cases (id, owner_user_id, title, purpose, subject_type, subject_label) VALUES ($1, $2, 'Synthetic import case', 'Integration test only', 'domain', 'example.com')",
      [caseId, ownerId]
    );

    const imported = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseId + '/import-observations',
      userId: ownerId,
      body: { observations: [observation] }
    });
    assert.equal(imported.status, 201);
    assert.equal(imported.body.importedCount, 1);
    assert.equal(imported.body.evidence[0].sourceProviderId, 'synthetic-dns');
    assert.equal(imported.body.evidence[0].provenanceKind, 'provider');

    const persisted = await routeCaseRequest({
      method: 'GET',
      pathname: '/api/cases/' + caseId + '/evidence',
      userId: ownerId
    });
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.evidence.length, 1);
    assert.equal(persisted.body.evidence[0].claim, observation.claim);
    assert.equal(persisted.body.evidence[0].sourceUrl, observation.source.url);
    assert.equal(persisted.body.evidence[0].freshnessState, 'unknown');

    const foreignImport = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseId + '/import-observations',
      userId: otherId,
      body: { observations: [observation] }
    });
    assert.equal(foreignImport.status, 404);

    const mismatched = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseId + '/import-observations',
      userId: ownerId,
      body: { observations: [{ ...observation, subject: { type: 'domain', value: 'other.example' } }] }
    });
    assert.equal(mismatched.status, 400);
    const unchanged = await pool.query('SELECT count(*)::int AS count FROM evidence_items WHERE case_id = $1', [caseId]);
    assert.equal(unchanged.rows[0].count, 1);
  } finally {
    await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[])', [[ownerId, otherId]]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, otherId]]);
  }
});
