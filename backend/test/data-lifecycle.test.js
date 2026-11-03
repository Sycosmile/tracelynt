import test from 'node:test';
import assert from 'node:assert/strict';

test('retention enforcement defaults to dry-run and requires an approved policy', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['db/enforce-retention.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: '', CASE_RETENTION_DAYS: '', AUDIT_RETENTION_DAYS: '' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set CASE_RETENTION_DAYS and\/or AUDIT_RETENTION_DAYS/);
});

test('retention enforcement rejects destructive mode without policy confirmation', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['db/enforce-retention.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: 'postgres://invalid', CASE_RETENTION_DAYS: '365', RETENTION_DRY_RUN: 'false', CONFIRM_RETENTION_POLICY: '' },
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CONFIRM_RETENTION_POLICY=YES/);
});
