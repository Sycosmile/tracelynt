import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';

test('private case API enforces owner isolation and versions evidence reports', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const userA = randomUUID();
  const userB = randomUUID();
  const issuer = 'https://tracelynt-test.invalid';
  const subjectA = randomUUID();
  const subjectB = randomUUID();
  let caseId;

  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $3, $4), ($2, $3, $5)',
      [userA, userB, issuer, subjectA, subjectB]
    );

    const created = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases',
      userId: userA,
      body: {
        title: 'Synthetic test case',
        purpose: 'Automated authorization test only',
        subjectType: 'domain',
        subjectLabel: 'example.com'
      }
    });
    assert.equal(created.status, 201);
    caseId = created.body.case.id;

    const ownList = await routeCaseRequest({ method: 'GET', pathname: '/api/cases', userId: userA });
    assert.equal(ownList.status, 200);
    assert.ok(ownList.body.cases.some((item) => item.id === caseId));

    const foreignRead = await routeCaseRequest({ method: 'GET', pathname: '/api/cases/' + caseId, userId: userB });
    assert.equal(foreignRead.status, 404);
    const foreignUpdate = await routeCaseRequest({
      method: 'PATCH', pathname: '/api/cases/' + caseId, userId: userB,
      body: { title: 'Unauthorized update' }
    });
    assert.equal(foreignUpdate.status, 404);

    const evidenceCreated = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/evidence', userId: userA,
      body: {
        claim: 'Synthetic observation for authorization testing.',
        category: 'direct_observation',
        sourceName: 'Automated test',
        sourceUrl: '',
        limitations: 'Not real evidence.'
      }
    });
    assert.equal(evidenceCreated.status, 201);

    const foreignEvidence = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/evidence', userId: userB
    });
    assert.equal(foreignEvidence.status, 404);

    const report = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports', userId: userA, body: {}
    });
    assert.equal(report.status, 201);
    assert.match(report.body.report.reportData.interpretation.statement, /not independently verified/);

    const secondReport = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports', userId: userA, body: {}
    });
    assert.equal(secondReport.status, 201);
    assert.equal(secondReport.body.report.versionNumber, report.body.report.versionNumber + 1);

    const foreignReports = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/reports', userId: userB
    });
    assert.equal(foreignReports.status, 404);
  } finally {
    const ids = [userA, userB];
    await pool.query('DELETE FROM cases WHERE owner_user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  }
});
