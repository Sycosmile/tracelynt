import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';
import { requestAccountDeletion } from '../src/auth.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('private case API enforces owner isolation and versions evidence reports', { skip: !process.env.DATABASE_URL }, async () => {
  // This integration test injects a synthetic inspector; explicitly enable that test-only path.
  const previousInspectionEnabled = process.env.DOMAIN_INSPECTION_ENABLED;
  const previousEgressAttestation = process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED;
  process.env.DOMAIN_INSPECTION_ENABLED = 'true';
  process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = 'true';
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

    const importedDomain = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseId + '/import-domain-observations',
      userId: userA,
      body: { domain: 'example.com' },
      domainInspector: async (domain) => ({
        domain,
        retrievedAt: '2026-10-27T12:00:00.000Z',
        limitations: ['Synthetic test observation only.'],
        observations: [
          {
            claim: 'DNS IPv4 check result: {"status":"ok","records":["8.8.8.8"]}',
            category: 'direct_observation',
            source: { name: 'Tracelynt DNS IPv4 inspection', providerId: null },
            retrievedAt: '2026-10-27T12:00:00.000Z',
            reviewState: 'unreviewed',
            freshness: { state: 'unknown' },
            provenance: { kind: 'system' },
            limitations: ['Synthetic test observation only.']
          },
          {
            claim: 'DNS MX check result: {"status":"error","records":[],"error":"SERVFAIL"}',
            category: 'direct_observation',
            source: { name: 'Tracelynt DNS MX inspection', providerId: null },
            retrievedAt: '2026-10-27T12:00:00.000Z',
            reviewState: 'unavailable',
            freshness: { state: 'unknown' },
            provenance: { kind: 'system' },
            limitations: ['Synthetic test observation only.']
          }
        ]
      })
    });
    assert.equal(importedDomain.status, 201);
    assert.equal(importedDomain.body.importedCount, 2);
    assert.equal(importedDomain.body.evidence[0].provenanceKind, 'system');
    assert.equal(importedDomain.body.evidence[0].freshnessState, 'unknown');
    assert.equal(importedDomain.body.evidence[1].reviewState, 'unavailable');

    const mismatchedDomainImport = await routeCaseRequest({
      method: 'POST',
      pathname: '/api/cases/' + caseId + '/import-domain-observations',
      userId: userA,
      body: { domain: 'not-example.com' },
      domainInspector: async () => { throw new Error('Inspector must not run for a mismatched subject.'); }
    });
    assert.equal(mismatchedDomainImport.status, 400);

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
        reviewState: 'corroborated',
        freshnessState: 'current',
        freshnessAsOf: '2026-10-27T11:00:00.000Z',
        provenanceKind: 'system',
        provenanceActorId: 'forged-analyst-17',
        sourceProviderId: 'forged-provider'
      }
    });
    assert.equal(evidenceCreated.status, 201);
    assert.equal(new Date(evidenceCreated.body.evidence.sourcePublishedAt).toISOString(), '2026-10-26T09:00:00.000Z');
    assert.equal(evidenceCreated.body.evidence.reviewState, 'unreviewed');
    assert.equal(evidenceCreated.body.evidence.freshnessState, 'unknown');
    assert.equal(evidenceCreated.body.evidence.freshnessAsOf, null);
    assert.equal(evidenceCreated.body.evidence.provenanceKind, 'user');
    assert.equal(evidenceCreated.body.evidence.provenanceActorId, null);
    assert.equal(evidenceCreated.body.evidence.sourceProviderId, null);
    assert.match(evidenceCreated.body.evidence.limitations, /are unverified/);

    const subjectChangeAfterEvidence = await routeCaseRequest({
      method: 'PATCH', pathname: '/api/cases/' + caseId, userId: userA,
      body: { subjectLabel: 'different.example' }
    });
    assert.equal(subjectChangeAfterEvidence.status, 409);
    assert.equal(subjectChangeAfterEvidence.body.error, 'CASE_SUBJECT_LOCKED');

    const unchangedSubject = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId, userId: userA
    });
    assert.equal(unchangedSubject.status, 200);
    assert.equal(unchangedSubject.body.case.subjectLabel, 'example.com');

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
    assert.equal(persistedEvidence.reviewState, 'unreviewed');
    assert.equal(persistedEvidence.freshnessState, 'unknown');
    assert.equal(persistedEvidence.freshnessAsOf, null);
    assert.equal(persistedEvidence.provenanceKind, 'user');
    assert.equal(persistedEvidence.provenanceActorId, null);
    assert.equal(persistedEvidence.sourceProviderId, null);

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
    assert.deepEqual(provenanceFinding.freshness, { state: 'unknown', asOf: null });
    assert.deepEqual(provenanceFinding.provenance, { kind: 'user', actorId: null });
    assert.equal(provenanceFinding.sourceProviderId, null);
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
    if (previousInspectionEnabled === undefined) delete process.env.DOMAIN_INSPECTION_ENABLED;
    else process.env.DOMAIN_INSPECTION_ENABLED = previousInspectionEnabled;
    if (previousEgressAttestation === undefined) delete process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED;
    else process.env.DOMAIN_INSPECTION_EGRESS_VERIFIED = previousEgressAttestation;
    const ids = [userA, userB];
    const resourceIds = caseId ? [caseId, userB] : [userB];
    await pool.query('DELETE FROM cases WHERE owner_user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[]) OR resource_id = ANY($2::uuid[])', [ids, resourceIds]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  }
});
