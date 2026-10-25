import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

function runPsql(script) {
  return new Promise((resolve, reject) => {
    if (!databaseUrl) {
      reject(new Error('DATABASE_URL is required to run database migrations.'));
      return;
    }
    const child = spawn(process.env.PSQL_PATH || 'psql', [
      '--no-psqlrc',
      '--set', 'ON_ERROR_STOP=1',
      '--dbname', databaseUrl
    ], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    child.once('error', (error) => {
      if (error.code === 'ENOENT') reject(new Error('psql was not found. Install PostgreSQL client tools or set PSQL_PATH.'));
      else reject(error);
    });
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('psql exited with status ' + code + '. Migration was not confirmed successful.'));
    });
    child.stdin.end(script);
  });
}

function quoteSqlLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

async function main() {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run database migrations.');
  const filenames = (await readdir(migrationDirectory))
    .filter((name) => /^\d{3,}_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  if (filenames.length === 0) throw new Error('No valid SQL migrations were found.');

  for (const filename of filenames) {
    const version = filename.slice(0, filename.length - 4);
    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
      throw new Error(filename + ' must not manage its own transaction; the migration runner owns transactions.');
    }
    const checksum = createHash('sha256').update(sql).digest('hex');
    const versionLiteral = quoteSqlLiteral(version);
    const checksumLiteral = quoteSqlLiteral(checksum);
    const script = [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      "SELECT pg_advisory_xact_lock(hashtext('tracelynt:schema-migrations'));",
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());',
      'DO $migration_guard$ BEGIN IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = ' + versionLiteral + ' AND checksum <> ' + checksumLiteral + ') THEN RAISE EXCEPTION ' + quoteSqlLiteral('Checksum mismatch for migration ' + version + '; do not edit an applied migration.') + '; END IF; END $migration_guard$;',
      'SELECT CASE WHEN EXISTS (SELECT 1 FROM schema_migrations WHERE version = ' + versionLiteral + ') THEN \'true\' ELSE \'false\' END AS already_applied \\gset',
      '\\if :already_applied',
      '\\echo ' + version + ' already applied; skipping',
      '\\else',
      sql,
      'INSERT INTO schema_migrations (version, checksum) VALUES (' + versionLiteral + ', ' + checksumLiteral + ');',
      '\\echo Applied ' + version,
      '\\endif',
      'COMMIT;',
      ''
    ].join('\n');
    process.stdout.write('Checking migration ' + version + '\n');
    await runPsql(script);
  }
}

main().catch((error) => {
  process.stderr.write('Migration failed: ' + error.message + '\n');
  process.exitCode = 1;
});
