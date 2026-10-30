import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';

test('case evidence relationships are typed, unique, and owner-scoped', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const caseId = randomUUID();
  const evidenceA = randomUUID();
  const evidenceB = randomUUID();
  const issuer = 'https://tracelynt-relationships-test.invalid';
  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $3, $4), ($2, $3, $5)',
      [ownerId, otherId, issuer, randomUUID(), randomUUID()]
    );
    await pool.query(
      "INSERT INTO cases (id, owner_user_id, title, purpose, subject_type, subject_label) VALUES ($1, $2, 'Synthetic relationship case', 'Integration test only', 'domain', 'example.com')",
      [caseId, ownerId]
    );
    for (const [id, claim] of [[evidenceA, 'Synthetic DNS result A'], [evidenceB, 'Synthetic DNS result B']]) {
      await pool.query(
        "INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, source_name) VALUES ($1, $2, $3, $4, 'direct_observation', 'Synthetic test')",
        [id, caseId, ownerId, claim]
      );
    }
    const created = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/relationships', userId: ownerId,
      body: { sourceEvidenceId: evidenceA, targetEvidenceId: evidenceB, relationshipType: 'corroborates', note: 'Synthetic records share a test fixture.' }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.relationship.relationshipType, 'corroborates');

    const duplicate = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/relationships', userId: ownerId,
      body: { sourceEvidenceId: evidenceA, targetEvidenceId: evidenceB, relationshipType: 'corroborates' }
    });
    assert.equal(duplicate.status, 409);

    const self = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/relationships', userId: ownerId,
      body: { sourceEvidenceId: evidenceA, targetEvidenceId: evidenceA, relationshipType: 'related_to' }
    });
    assert.equal(self.status, 400);

    const listed = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/relationships', userId: ownerId
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.relationships.length, 1);

    const foreign = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/relationships', userId: otherId
    });
    assert.equal(foreign.status, 404);

    const foreignEvidence = randomUUID();
    const wrongCaseLink = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/relationships', userId: ownerId,
      body: { sourceEvidenceId: evidenceA, targetEvidenceId: foreignEvidence, relationshipType: 'related_to' }
    });
    assert.equal(wrongCaseLink.status, 404);

    const report = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports', userId: ownerId, body: {}
    });
    assert.equal(report.status, 201);
    assert.equal(report.body.report.reportData.relationships.length, 1);
    assert.equal(report.body.report.reportData.relationships[0].relationshipType, 'corroborates');
  } finally {
    await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[])', [[ownerId, otherId]]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, otherId]]);
  }
});
