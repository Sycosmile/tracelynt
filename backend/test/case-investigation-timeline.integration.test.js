import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool } from '../src/db.js';
import { routeCaseRequest } from '../src/cases.js';

test('case timeline returns scoped investigation actions in chronological order', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const caseId = randomUUID();
  const evidenceId = randomUUID();
  const issuer = 'https://tracelynt-timeline-test.invalid';
  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $3, $4), ($2, $3, $5)',
      [ownerId, otherId, issuer, randomUUID(), randomUUID()]
    );
    await pool.query(
      "INSERT INTO cases (id, owner_user_id, title, purpose, subject_type, subject_label) VALUES ($1, $2, 'Synthetic timeline case', 'Integration test only', 'domain', 'example.com')",
      [caseId, ownerId]
    );
    await pool.query(
      "INSERT INTO evidence_items (id, case_id, creator_user_id, claim, category, source_name) VALUES ($1, $2, $3, 'Synthetic timeline evidence', 'direct_observation', 'Test fixture')",
      [evidenceId, caseId, ownerId]
    );
    await pool.query(
      "INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, outcome) VALUES ($1, $2, 'import_observations', 'case', $3, 'success'), ($4, $2, 'import', 'evidence', $5, 'success')",
      [randomUUID(), ownerId, caseId, randomUUID(), evidenceId]
    );

    const timeline = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/timeline', userId: ownerId
    });
    assert.equal(timeline.status, 200);
    assert.equal(timeline.body.events.length, 2);
    assert.ok(timeline.body.events.every(event => event.eventId && event.occurredAt));
    assert.deepEqual(
      timeline.body.events.map(event => event.eventType).sort(),
      ['import', 'import_observations'].sort()
    );

    const foreign = await routeCaseRequest({
      method: 'GET', pathname: '/api/cases/' + caseId + '/timeline', userId: otherId
    });
    assert.equal(foreign.status, 404);
  } finally {
    await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ANY($1::uuid[])', [[ownerId, otherId]]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, otherId]]);
  }
});
