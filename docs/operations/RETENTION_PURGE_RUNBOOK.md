# Pending-record purge runbook

## Scope and limitations

The current `backend/db/purge-pending-cases.js` command is a guarded manual operation against the primary PostgreSQL database. It is not a complete retention system.

It can delete cases already marked `deletion_pending`, delete eligible accounts that have no remaining cases, remove expired or revoked sessions, and (when no owner filter is supplied) remove expired OIDC login transactions. It does not delete backups, replicas, exports, logs, caches, provider-held data, or files outside the database.

No retention periods are approved by this command. Do not schedule it automatically or use it as a substitute for an approved retention policy.

## Preconditions

Before any non-dry-run execution:

1. Obtain approval under the organization's applicable retention and deletion policy.
2. Confirm the request is authorized and that no legal hold, security hold, or active investigation exception applies.
3. Confirm the target environment and database identity; never rely on a shell prompt or hostname alone.
4. Confirm a recoverable backup and the documented restoration procedure.
5. Review the dry-run output and the intended owner scope with a second operator where operationally possible.
6. Confirm the application version and migration state are compatible with the command.
7. Keep database credentials out of shell history, command arguments, chat, and logs.

## Dry run

From the repository root, configure `DATABASE_URL` for the intended database and run:

**POSIX shell**
```sh
cd backend
PURGE_DRY_RUN=true npm run purge:pending
```

**PowerShell**
```powershell
Set-Location backend
$env:PURGE_DRY_RUN = "true"
npm run purge:pending
Remove-Item Env:PURGE_DRY_RUN
```

The command defaults to dry-run when `PURGE_DRY_RUN` is omitted; only the exact value `false` selects destructive mode, and that mode also requires `CONFIRM_PURGE_PENDING_CASES=YES`. Other values are rejected. The dry run uses a read-only transaction and reports counts for pending cases, eligible pending accounts, expired/revoked sessions, and (without an owner filter) expired login transactions. When an owner filter is used, the login-transaction count is intentionally reported as null because those transactions are not scoped by owner in this command.

The dry run does not reserve rows or guarantee the counts will remain unchanged before a later purge. Re-run it immediately before execution.

## Narrow an operation to specific owners

Set `PURGE_OWNER_IDS` to a comma-separated list of valid user UUIDs. The filter applies to pending cases, eligible accounts, and expired/revoked sessions. It does not scope OIDC login-transaction deletion; when an owner filter is present, login transactions are not purged.

**PowerShell example**
```powershell
$env:PURGE_OWNER_IDS = "00000000-0000-4000-8000-000000000001"
$env:PURGE_DRY_RUN = "true"
npm run purge:pending
```

Use only verified internal identifiers. Do not paste personal data into this variable.

## Execute an approved purge

After reviewing the dry run and obtaining explicit approval:

**POSIX shell**
```sh
PURGE_DRY_RUN=false CONFIRM_PURGE_PENDING_CASES=YES npm run purge:pending
```

**PowerShell**
```powershell
$env:PURGE_DRY_RUN = "false"
$env:CONFIRM_PURGE_PENDING_CASES = "YES"
npm run purge:pending
Remove-Item Env:PURGE_DRY_RUN
Remove-Item Env:CONFIRM_PURGE_PENDING_CASES
```

Add `PURGE_OWNER_IDS` only when the approved scope is limited to specific owners. Without it, all pending cases and eligible accounts are in scope, along with all expired/revoked sessions and expired login transactions.

The script performs its database changes in a transaction. A failed transaction is rolled back. A successful transaction is not a promise that every copy of the data has been erased.

## After execution

- Record the operator, approval reference, environment, commit, timestamp, scope, dry-run counts, and command outcome in the approved operational record.
- Verify the expected primary-database rows are gone using an authorized read-only check.
- Track backup expiry, replica cleanup, export removal, log/cache handling, and provider deletion separately under the approved policy.
- Escalate any mismatch or partial deletion; do not rerun blindly.
- Preserve only the minimum audit evidence permitted by the retention policy.

## Release blockers

- [ ] Approved retention periods and legal basis by data class.
- [ ] Inventory of primary, derived, replica, backup, export, log, cache, and provider-held copies.
- [ ] Tested backup expiry and restoration procedure.
- [ ] Deletion verification and exception/hold workflow.
- [ ] Scheduled enforcement design with alerting and failure handling, approved separately.

Until these controls exist, the command remains a manually reviewed primary-database purge tool only.
