import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPool } from '../src/db.js';

test('purge dry-run reports scoped counts without deleting pending records', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = getPool();
  const ownerId = randomUUID();
  const caseId = randomUUID();
  try {
    await pool.query(
      'INSERT INTO users (id, oidc_issuer, oidc_subject) VALUES ($1, $2, $3)',
      [ownerId, 'https://tracelynt-purge-preview.invalid', randomUUID()]
    );
    await pool.query(
      "INSERT INTO cases (id, owner_user_id, title, purpose, subject_type, subject_label, status) VALUES ($1, $2, 'Synthetic pending case', 'Dry-run test only', 'domain', 'example.com', 'deletion_pending')",
      [caseId, ownerId]
    );

    const purgePath = fileURLToPath(new URL('../db/purge-pending-cases.js', import.meta.url));
    const preview = spawnSync(process.execPath, [purgePath], {
      env: { ...process.env, PURGE_DRY_RUN: 'true', PURGE_OWNER_IDS: ownerId, CONFIRM_PURGE_PENDING_CASES: '' },
      encoding: 'utf8'
    });
    assert.equal(preview.status, 0, preview.stderr);
    const result = JSON.parse(preview.stdout);
    assert.equal(result.dryRun, true);
    assert.equal(result.pendingCases, 1);

    const stillPresent = await pool.query('SELECT id FROM cases WHERE id = $1', [caseId]);
    assert.equal(stillPresent.rowCount, 1);
  } finally {
    await pool.query('DELETE FROM cases WHERE id = $1', [caseId]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = $1 OR resource_id = $2', [ownerId, caseId]);
    await pool.query('DELETE FROM users WHERE id = $1', [ownerId]);
  }
});
