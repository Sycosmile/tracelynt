import { randomUUID } from 'node:crypto';
import { getPool, closePool } from '../src/db.js';

async function main() {
  if (process.env.CONFIRM_PURGE_PENDING_CASES !== 'YES') {
    throw new Error('Refusing to purge. Set CONFIRM_PURGE_PENDING_CASES=YES after reviewing the retention policy.');
  }
  const ownerIds = process.env.PURGE_OWNER_IDS
    ? process.env.PURGE_OWNER_IDS.split(',').map((value) => value.trim()).filter(Boolean)
    : null;
  if (ownerIds && (!ownerIds.length || ownerIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))) {
    throw new Error('PURGE_OWNER_IDS must be a comma-separated list of valid UUIDs.');
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = ownerIds
      ? await client.query("DELETE FROM cases WHERE status = 'deletion_pending' AND owner_user_id = ANY($1::uuid[]) RETURNING id", [ownerIds])
      : await client.query("DELETE FROM cases WHERE status = 'deletion_pending' RETURNING id");
    for (const row of pending.rows) {
      await client.query(
        "INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, outcome) VALUES ($1, NULL, 'purge', 'case', $2, 'success')",
        [randomUUID(), row.id]
      );
    }
    const accounts = await client.query(
      "DELETE FROM users u WHERE u.status = 'deletion_pending' AND ($1::uuid[] IS NULL OR u.id = ANY($1::uuid[])) AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.owner_user_id = u.id) RETURNING id",
      [ownerIds]
    );
    for (const row of accounts.rows) {
      await client.query(
        "INSERT INTO audit_events (id, actor_user_id, action, resource_type, resource_id, outcome) VALUES ($1, NULL, 'purge', 'account', $2, 'success')",
        [randomUUID(), row.id]
      );
    }
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
