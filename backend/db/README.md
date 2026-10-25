# Database foundation (development only)

This folder introduces the initial PostgreSQL schema for the planned private case workspace. It does **not** implement authentication, session middleware, case API routes, or authorization. Do not store real investigation or personal data in this prototype.

## Requirements

- Docker Engine with Compose, or a local PostgreSQL 17 installation.
- psql client.
- Node.js 22+ for the existing API.

## Start local PostgreSQL

From the repository root:

    docker compose up -d postgres

The Compose service binds port 5432 to 127.0.0.1 only. Its fallback password is development-only; override it using a local, untracked .env file before use. Never reuse it outside a disposable local environment.

Connection URL for the default local-only configuration:

    postgresql://tracelynt_app:local-dev-only-change-me@127.0.0.1:5432/tracelynt

Apply the first migration from the repository root:

    psql "postgresql://tracelynt_app:local-dev-only-change-me@127.0.0.1:5432/tracelynt" -v ON_ERROR_STOP=1 -f backend/db/migrations/001_initial_schema.sql

On PowerShell, run the command as a single line. If you changed the local password, update the connection URL accordingly. Do not commit local .env files or secrets.

Verify the schema:

    psql "postgresql://tracelynt_app:local-dev-only-change-me@127.0.0.1:5432/tracelynt" -c "\dt"

Run the migration runner from the backend directory with DATABASE_URL set to the local connection string: `npm run migrate`. The runner creates a schema_migrations ledger, serializes concurrent runs with a PostgreSQL advisory transaction lock, applies each migration and ledger row in one transaction, skips already-applied migrations, and rejects checksum changes to applied migrations. It requires the PostgreSQL `psql` client. The current automated tests check the schema and runner guards; they do not replace a live PostgreSQL integration test.

## Schema overview

- users: unique OIDC issuer/subject pair and account status.
- sessions: SHA-256-sized opaque-token hash, expiry, revocation, and user relationship.
- cases: owner, purpose, subject descriptor, lifecycle status, and optional retention deadline.
- evidence_items: provenance, review state, limitations, correction/retraction metadata.
- report_versions: versioned JSON report snapshots, scoped to cases.
- audit_events: minimized event metadata for access and lifecycle actions.

Application code must authorize every case/evidence/report operation against the authenticated owner. UUIDs are identifiers, not authorization. The database schema is not a substitute for authorization tests. Before production, add and test a migration ledger/runner, least-privilege database roles, backup restoration, retention/deletion behavior, and access-control integration tests.
