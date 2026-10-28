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
        limitations: 'Not real evidence.',
        observedAt: '2026-10-27T10:00:00.000Z',
        sourcePublishedAt: '2026-10-26T09:00:00.000Z',
        freshnessState: 'stale',
        freshnessAsOf: '2026-10-27T11:00:00.000Z',
        provenanceKind: 'provider',
        provenanceActorId: 'test-analyst-17',
        sourceProviderId: 'test-public-registry'
      }
    });
    assert.equal(evidenceCreated.status, 201);
    assert.equal(new Date(evidenceCreated.body.evidence.sourcePublishedAt).toISOString(), '2026-10-26T09:00:00.000Z');
    assert.equal(evidenceCreated.body.evidence.freshnessState, 'stale');
    assert.equal(new Date(evidenceCreated.body.evidence.freshnessAsOf).toISOString(), '2026-10-27T11:00:00.000Z');
    assert.equal(evidenceCreated.body.evidence.provenanceKind, 'provider');
    assert.equal(evidenceCreated.body.evidence.provenanceActorId, 'test-analyst-17');
    assert.equal(evidenceCreated.body.evidence.sourceProviderId, 'test-public-registry');

    const legacyEvidence = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/evidence', userId: userA,
      body: {
        claim: 'Legacy-shaped synthetic evidence.',
        category: 'user_report',
        sourceName: 'Manual test input',
        sourceUrl: '',
        limitations: 'Compatibility test.'
      }
    });
    assert.equal(legacyEvidence.status, 201);
    assert.equal(legacyEvidence.body.evidence.freshnessState, 'unknown');
    assert.equal(legacyEvidence.body.evidence.freshnessAsOf, null);
    assert.equal(legacyEvidence.body.evidence.sourcePublishedAt, null);
    assert.equal(legacyEvidence.body.evidence.provenanceKind, 'user');
    assert.equal(legacyEvidence.body.evidence.provenanceActorId, null);
    assert.equal(legacyEvidence.body.evidence.sourceProviderId, null);

    const ownEvidence = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/evidence', userId: userA
    });
    assert.equal(ownEvidence.status, 200);
    const persistedEvidence = ownEvidence.body.evidence.find((item) => item.id === evidenceCreated.body.evidence.id);
    assert.ok(persistedEvidence);
    assert.equal(new Date(persistedEvidence.sourcePublishedAt).toISOString(), '2026-10-26T09:00:00.000Z');
    assert.equal(persistedEvidence.freshnessState, 'stale');
    assert.equal(new Date(persistedEvidence.freshnessAsOf).toISOString(), '2026-10-27T11:00:00.000Z');
    assert.equal(persistedEvidence.provenanceKind, 'provider');
    assert.equal(persistedEvidence.provenanceActorId, 'test-analyst-17');
    assert.equal(persistedEvidence.sourceProviderId, 'test-public-registry');

    const foreignEvidence = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/evidence', userId: userB
    });
    assert.equal(foreignEvidence.status, 404);

    const report = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports', userId: userA, body: {}
    });
    assert.equal(report.status, 201);
    assert.match(report.body.report.reportData.interpretation.statement, /not independently verified/);
    const findings = report.body.report.reportData.findings;
    const provenanceFinding = findings.find((item) => item.id === evidenceCreated.body.evidence.id);
    assert.ok(provenanceFinding);
    assert.equal(provenanceFinding.sourcePublishedAt, '2026-10-26T09:00:00.000Z');
    assert.deepEqual(provenanceFinding.freshness, {
      state: 'stale',
      asOf: '2026-10-27T11:00:00.000Z'
    });
    assert.deepEqual(provenanceFinding.provenance, {
      kind: 'provider',
      actorId: 'test-analyst-17'
    });
    assert.equal(provenanceFinding.sourceProviderId, 'test-public-registry');
    const legacyFinding = findings.find((item) => item.id === legacyEvidence.body.evidence.id);
    assert.ok(legacyFinding);
    assert.equal(legacyFinding.sourcePublishedAt, null);
    assert.deepEqual(legacyFinding.freshness, { state: 'unknown', asOf: null });
    assert.deepEqual(legacyFinding.provenance, { kind: 'user', actorId: null });
    assert.equal(legacyFinding.sourceProviderId, null);
    const reportId = report.body.report.id;
    const ownReportRead = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/reports/' + reportId, userId: userA
    });
    assert.equal(ownReportRead.status, 200);
    const foreignReportRead = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/reports/' + reportId, userId: userB
    });
    assert.equal(foreignReportRead.status, 404);
    const ownExport = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports/' + reportId + '/export', userId: userA, body: {}
    });
    assert.equal(ownExport.status, 200);
    const foreignExport = await routeCaseRequest({
      method: 'POST', pathname: '/api/cases/' + caseId + '/reports/' + reportId + '/export', userId: userB, body: {}
    });
    assert.equal(foreignExport.status, 404);

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
    const retainedAccountAudit = await pool.query(
      "SELECT count(*)::int AS count FROM audit_events WHERE resource_type = 'account' AND resource_id = $1 AND action = 'purge'",
      [userB]
    );
    assert.equal(retainedAccountAudit.rows[0].count, 1);
  } finally {
    const ids = [userA, userB];
    const resourceIds = caseId ? [caseId, userB] : [userB];
    await pool.query('DELETE FROM cases WHERE owner_user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[]) OR resource_id = ANY($2::uuid[])', [ids, resourceIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  }
});
