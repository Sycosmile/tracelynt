# PostgreSQL setup (development only)

The PostgreSQL schema and migration runner support the private workspace API. Do not store real investigation or personal data in this prototype.

## Requirements

- Docker Engine with Compose, or PostgreSQL 17.
- PostgreSQL psql client.
- Node.js 22+ and backend npm dependencies.

## Start local PostgreSQL

From the repository root:

    docker compose up -d postgres

The Compose service binds port 5432 to 127.0.0.1 only. Its fallback password is development-only. Change it before keeping any data and never reuse it outside a disposable local environment.

Default local connection URL:

    postgresql://tracelynt_app:local-dev-only-change-me@127.0.0.1:5432/tracelynt

From backend, set DATABASE_URL to that URL and run:

    npm install
    npm run migrate

The runner discovers versioned SQL migrations, creates a checksum ledger, serializes concurrent runs with an advisory transaction lock, applies each migration and its ledger entry in one transaction, skips already-applied migrations, and rejects checksum changes to applied migrations. It requires psql.

## Purge requested deletions

Only run this after reviewing and approving the applicable retention policy. The command permanently deletes all cases marked deletion_pending from the primary database, removes pending accounts after their cases are gone, and cleans expired/revoked sessions and expired login transactions. It does not erase backups.

From backend, after installing dependencies and setting DATABASE_URL:

    $env:CONFIRM_PURGE_PENDING_CASES = "YES"
    npm run purge:pending
    Remove-Item Env:CONFIRM_PURGE_PENDING_CASES

By default, the command processes every pending case/account in the configured database. To scope a run to selected synthetic/test owners, set PURGE_OWNER_IDS to a comma-separated list of UUIDs. Do not run the unscoped command against a database until the retention policy and target environment have been verified.

See [Retention and deletion operations](../../docs/RETENTION_OPERATIONS.md) for the read-only preview and the production deletion limitations.

## Schema overview

- users: unique OIDC issuer/subject pair and account status.
- sessions: hash of an opaque session token, expiry and revocation.
- oidc_login_transactions: short-lived hashed state/browser binding plus nonce and PKCE verifier.
- cases: owner, purpose, subject descriptor, lifecycle status and optional retention deadline.
- evidence_items: provenance, review state, limitations, correction/retraction metadata.
- report_versions: immutable versioned JSON report snapshots.
- audit_events: minimized metadata for access and lifecycle actions.

## Important boundaries

Application queries enforce case ownership; UUIDs are identifiers, not authorization. The API implements owner-scoped case/evidence/report operations, OIDC/session code, account deletion requests, and an explicit operator purge command. No real provider credentials or deployment are configured. A purge requires CONFIRM_PURGE_PENDING_CASES=YES and should only run after the retention policy is reviewed; it deletes pending primary database rows, not backup copies. Scheduling, approved retention periods, backup expiry/restoration, least-privilege role provisioning, and operational monitoring remain release blockers.

GitHub Actions runs migration checks against PostgreSQL, including repeat application, schema verification, rollback of a deliberately broken migration, checksum mismatch detection, and database-backed authorization tests. Confirm the latest Actions result before relying on those checks.
