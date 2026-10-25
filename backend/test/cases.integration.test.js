import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';
import { requestAccountDeletion } from '../src/auth.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

    const unconfirmedDelete = await routeCaseRequest({
      method: 'DELETE', pathname: '/api/cases/' + caseId, userId: userA, body: {}
    });
    assert.equal(unconfirmedDelete.status, 400);
    const deleteRequest = await routeCaseRequest({
      method: 'DELETE', pathname: '/api/cases/' + caseId, userId: userA, body: { confirm: true }
    });
    assert.equal(deleteRequest.status, 202);
    assert.equal(deleteRequest.body.status, 'deletion_pending');
    const hiddenAfterDeleteRequest = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId, userId: userA
    });
    assert.equal(hiddenAfterDeleteRequest.status, 404);

    await requestAccountDeletion(userB);
    const purgePath = fileURLToPath(new URL('../db/purge-pending-cases.js', import.meta.url));
    const purge = spawnSync(process.execPath, [purgePath], {
      env: { ...process.env, CONFIRM_PURGE_PENDING_CASES: 'YES', PURGE_OWNER_IDS: [userA, userB].join(',') },
      encoding: 'utf8'
    });
    assert.equal(purge.status, 0, purge.stderr);
    const purgedCase = await pool.query('SELECT id FROM cases WHERE id = $1', [caseId]);
    assert.equal(purgedCase.rowCount, 0);
    const purgedAccount = await pool.query('SELECT id FROM users WHERE id = $1', [userB]);
    assert.equal(purgedAccount.rowCount, 0);
    const retainedAudit = await pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE resource_type = 'case' AND resource_id = $1 AND action = 'purge'",
      [caseId]
    );
    assert.equal(retainedAudit.rows[0].count, 1);
  } finally {
    const ids = [userA, userB];
    const resourceIds = caseId ? [caseId, userB] : [userB];
    await pool.query('DELETE FROM cases WHERE owner_user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[]) OR resource_id = ANY($2::uuid[])', [ids, resourceIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  }
});
