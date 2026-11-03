import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';

test('private case subresources reject cross-account and cross-case evidence access', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const userA = randomUUID();
  const userB = randomUUID();
  const issuer = 'https://authorization-boundary.invalid';
  let caseA;
  let caseB;
  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $3, $4), ($2, $3, $5)',
      [userA, userB, issuer, randomUUID(), randomUUID()]
    );
    const createCase = async (userId, subject) => {
      const result = await routeCaseRequest({
        method: 'POST',
        pathname: '/api/cases',
        userId,
        body: {
          title: 'Synthetic authorization case',
          purpose: 'Object-level authorization regression test only',
          subjectType: 'other',
          subjectLabel: subject
        }
      });
      assert.equal(result.status, 201);
      return result.body.case.id;
    };
    caseA = await createCase(userA, 'synthetic-subject-a');
    caseB = await createCase(userB, 'synthetic-subject-b');

    const createEvidence = async (caseId, userId) => {
      const result = await routeCaseRequest({
        method: 'POST',
        pathname: '/api/cases/' + caseId + '/evidence',
        userId,
        body: {
          claim: 'Synthetic evidence used only for authorization testing.',
          category: 'user_report',
          sourceName: 'Automated test',
          sourceUrl: '',
          limitations: 'Not real evidence.'
        }
      });
      assert.equal(result.status, 201);
      return result.body.evidence.id;
    };
    const evidenceA = await createEvidence(caseA, userA);
    const evidenceB = await createEvidence(caseB, userB);

    for (const suffix of ['/timeline', '/relationships', '/evidence', '/reports']) {
      const foreign = await routeCaseRequest({
        method: 'GET',
        pathname: '/api/cases/' + caseA + suffix,
        userId: userB
      });
      assert.equal(foreign.status, 404, suffix);
      assert.equal(foreign.body.error, 'NOT_FOUND', suffix);
    }

    const crossCaseRelationship = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseA + '/relationships',
      userId: userA,
      body: {
        sourceEvidenceId: evidenceA,
        targetEvidenceId: evidenceB,
        relationshipType: 'related_to',
        note: 'Must not link evidence across case boundaries.'
      }
    });
    assert.equal(crossCaseRelationship.status, 404);
    assert.equal(crossCaseRelationship.body.error, 'NOT_FOUND');

    const foreignEvidenceUpdate = await routeCaseRequest({
      method: 'PATCH',
      pathname: '/api/cases/' + caseA + '/evidence/' + evidenceA,
      userId: userB,
      body: { reviewState: 'disputed' }
    });
    assert.equal(foreignEvidenceUpdate.status, 404);
    assert.equal(foreignEvidenceUpdate.body.error, 'NOT_FOUND');
  } finally {
    const caseIds = [caseA, caseB].filter(Boolean);
    if (caseIds.length) {
      await pool.query('DELETE FROM cases WHERE id = ANY($1::uuid[])', [caseIds]);
      await pool.query('DELETE FROM audit_events WHERE resource_id = ANY($1::uuid[]) OR actor_user_id = ANY($2::uuid[])', [caseIds, [userA, userB]]);
    }
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
  }
});
