import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const migrationDirectory = fileURLToPath(new URL('../db/migrations/', import.meta.url));

test('initial schema contains the expected private-workspace tables and ownership indexes', async () => {
  const sql = await readFile(path.join(migrationDirectory, '001_initial_schema.sql'), 'utf8');
  for (const table of ['users', 'sessions', 'cases', 'evidence_items', 'report_versions', 'audit_events']) {
    assert.match(sql, new RegExp('CREATE TABLE ' + table + '\\s*\\(', 'i'), table + ' table exists');
  }
  assert.match(sql, /owner_user_id uuid NOT NULL REFERENCES users\(id\)/);
  assert.match(sql, /cases_owner_updated_idx/);
  assert.match(sql, /UNIQUE \(oidc_issuer, oidc_subject\)/);
  assert.match(sql, /token_hash bytea PRIMARY KEY/);
  assert.match(sql, /octet_length\(token_hash\) = 32/);
  assert.match(sql, /UNIQUE \(case_id, version_number\)/);
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)\s*;/im, 'runner owns transaction boundaries');
});

test('migration filenames follow the runner naming convention', async () => {
  const names = await readdir(migrationDirectory);
  const migrations = names.filter((name) => name.endsWith('.sql'));
  assert.ok(migrations.length > 0, 'at least one migration exists');
  for (const name of migrations) assert.match(name, /^\d{3,}_[a-z0-9_]+\.sql$/);
});

test('migration runner refuses to start without DATABASE_URL', async () => {
  const runnerPath = fileURLToPath(new URL('../db/migrate.js', import.meta.url));
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [runnerPath], {
    env: { ...process.env, DATABASE_URL: '' },
    encoding: 'utf8'
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL is required/);
});
