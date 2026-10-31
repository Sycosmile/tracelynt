# Retention and backup deletion lifecycle

## Policy gate
This plan defines no retention duration. The responsible organization must approve lawful purpose, jurisdictions, data classes, retention triggers, legal holds, and exceptions before production data is stored.

## Data inventory
Cover search inputs and provider responses; cases, evidence, relationships, reports and exports; audit/security events and sessions; caches, logs and traces; replicas, snapshots, backups and disaster-recovery copies; and data retained by external providers.

## Required deletion workflow
1. Record the approved policy version and deletion trigger.
2. Mark eligible records pending and revoke applicable sessions.
3. Produce a read-only, scoped preview with counts by data class and target.
4. Require an authorized operator and explicit confirmation.
5. Delete or expire records in primary storage and all covered derived stores.
6. Track backup expiry under the approved schedule and document technical limitations.
7. Verify completion and record an audit receipt without copying deleted personal data.
8. Escalate exceptions, legal holds, failed targets and overdue expiry.

## Acceptance tests
- Dry-run is read-only and scoped exactly to requested owners and data classes.
- Repeated execution is idempotent.
- Concurrent deletion requests do not expose pending data.
- Cascades and exported-object deletion are verified.
- Replica and backup expiry are tested in selected infrastructure.
- Audit receipts contain counts/status, not deleted payloads.
- Legal holds are explicit, time-bounded, reviewed and audited.

## Current limitation
The purge command operates on primary PostgreSQL only. It does not delete backups, replicas, exports, logs or provider-side records. This plan does not authorize scheduled purging.
