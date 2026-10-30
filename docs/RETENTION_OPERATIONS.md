# Retention and deletion operations

This runbook defines a safe operational sequence; it does not set retention periods or authorize a purge. The retention policy, legal basis, applicable jurisdictions, exception handling, and backup lifecycle must be approved by the responsible organization before production data is stored.

## Current implementation boundary

- Case/account deletion requests mark records as pending and hide them from normal application access.
- The guarded purge command permanently deletes pending case/account rows and expired/revoked sessions from the configured primary PostgreSQL database.
- PostgreSQL foreign-key cascades remove case evidence, relationship records, and report versions when the parent case is deleted.
- The purge command does not delete object-storage exports, provider-side records, database backups, replicas, snapshots, logs, or external analytics.
- A successful primary-database purge is not proof of complete deletion across the service.

## Before enabling production retention

Record an approved policy covering each data class separately: search inputs, provider responses, cases, evidence, relationships, reports/exports, audit events, authentication sessions, abuse/security records, caches, logs, replicas, and backups.

For each class, document:

- purpose and lawful basis;
- approved retention period and the event that starts the clock;
- owner accountable for enforcement;
- legal-hold or incident exception process and review date;
- deletion method, including replicas and backups;
- evidence that deletion completed and how exceptions are audited.

Do not substitute an arbitrary default period. Do not run a purge against a production database until the policy and target environment have been independently checked.

## Safe preview and execution

1. Confirm the database host, database name, environment, and operator identity.
2. Confirm the approved policy and scope. Prefer PURGE_OWNER_IDS for a reviewed, bounded operation.
3. Run a read-only preview:

   ```sh
   PURGE_DRY_RUN=true PURGE_OWNER_IDS="<reviewed-uuid-list>" npm run purge:pending
   ```

   The preview reports counts only and does not mutate rows. If PURGE_OWNER_IDS is omitted, the preview covers all pending cases/accounts and expired/revoked sessions in the configured database.
4. Compare the preview with the approved deletion request and expected counts. Investigate unexpected or zero counts before proceeding.
5. For an approved execution, remove PURGE_DRY_RUN, set CONFIRM_PURGE_PENDING_CASES=YES, retain the reviewed owner scope where possible, and run the command once.
6. Record the operator, timestamp, database environment, approved scope, preview counts, execution counts, and any exceptions in the organization's controlled change record.
7. Verify backup, replica, export, cache, and log deletion separately using the procedures of those systems. The application command cannot verify those systems.

## Recovery and incident handling

Do not restore purged personal or investigation data from backups without checking the approved retention policy and any deletion requests that occurred after the backup. If deletion was incomplete, stop further processing, restrict access to affected copies, notify the accountable privacy/security owner, and follow the organization's incident and legal-notification procedures.

## Release blockers

- Approved data-class retention schedule and legal-hold process.
- Scheduled enforcement with monitoring and failure alerting.
- Verified backup/replica/export/cache/log expiry and deletion.
- Tested restore procedure that reapplies deletion tombstones or equivalent controls.
- Independent review of operator permissions and production purge procedure.