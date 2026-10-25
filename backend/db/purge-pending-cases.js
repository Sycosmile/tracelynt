import { randomUUID } from 'node:crypto';
import { getPool, closePool } from '../src/db.js';

async function main() {
  if (process.env.CONFIRM_PURGE_PENDING_CASES !== 'YES') {
    throw new Error('Refusing to purge. Set CONFIRM_PURGE_PENDING_CASES=YES after reviewing the retention policy.');
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      "DELETE FROM cases WHERE status = 'deletion_pending' RETURNING id"
    );
    for (const row of pending.rows) {
      await client.query(
        "INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, outcome) VALUES ($1, NULL, 'purge', 'case', $2, 'success')",
        [randomUUID(), row.id]
      );
    }
    const accounts = await client.query(
      "DELETE FROM users u WHERE u.status = 'deletion_pending' AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.owner_user_id = u.id) RETURNING id"
    );
    await client.query('DELETE FROM sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL');
    await client.query('DELETE FROM oidc_login_transactions WHERE expires_at <= now()');
    await client.query('COMMIT');
    process.stdout.write('Purged pending cases: ' + pending.rowCount + '; pending accounts: ' + accounts.rowCount + '; expired sessions/login transactions removed.\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  process.stderr.write('Purge failed: ' + error.message + '\n');
  process.exitCode = 1;
});
