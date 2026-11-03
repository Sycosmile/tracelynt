import { getPool, closePool } from '../src/db.js';

function retentionDays(name, required = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    if (required) throw new Error('Set CASE_RETENTION_DAYS and/or AUDIT_RETENTION_DAYS to an approved retention period.');
    return null;
  }
  if (!/^\d+$/.test(raw)) throw new Error(name + ' must be a whole number of days.');
  const days = Number(raw);
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500) {
    throw new Error(name + ' must be between 1 and 36500 days.');
  }
  return days;
}

async function main() {
  const caseDays = retentionDays('CASE_RETENTION_DAYS');
  const auditDays = retentionDays('AUDIT_RETENTION_DAYS');
  if (caseDays === null && auditDays === null) {
    throw new Error('Set CASE_RETENTION_DAYS and/or AUDIT_RETENTION_DAYS to an approved retention period.');
  }

  const dryRun = process.env.RETENTION_DRY_RUN !== 'false';
  if (!dryRun && process.env.CONFIRM_RETENTION_POLICY !== 'YES') {
    throw new Error('Refusing destructive retention enforcement. Set CONFIRM_RETENTION_POLICY=YES after policy approval.');
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(dryRun ? 'BEGIN READ ONLY' : 'BEGIN');

    let eligibleCases = 0;
    let auditEventsForReview = 0;

    if (caseDays !== null) {
      const result = await client.query(
        `SELECT count(*)::int AS count
         FROM cases
         WHERE status <> 'deletion_pending'
           AND COALESCE(retention_deadline, created_at + ($1::int * interval '1 day')) <= now()`,
        [caseDays]
      );
      eligibleCases = result.rows[0].count;

      if (!dryRun) {
        await client.query(
          `UPDATE cases
           SET retention_deadline = COALESCE(retention_deadline, created_at + ($1::int * interval '1 day')),
               status = 'deletion_pending',
               updated_at = now()
           WHERE status <> 'deletion_pending'
             AND COALESCE(retention_deadline, created_at + ($1::int * interval '1 day')) <= now()`,
          [caseDays]
        );
      }
    }

    if (auditDays !== null) {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE occurred_at <= now() - ($1::int * interval '1 day')",
        [auditDays]
      );
      auditEventsForReview = result.rows[0].count;
    }

    await client.query('COMMIT');
    process.stdout.write(JSON.stringify({
      dryRun,
      eligibleCases,
      auditEventsForReview,
      auditEventsDeleted: 0,
      note: 'Audit events are counted for policy review only and are never deleted by this command.'
    }) + '\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  process.stderr.write('Retention enforcement failed: ' + error.message + '\n');
  process.exitCode = 1;
});
