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

The migration is transactional and intended to be applied once to a fresh database. A versioned migration runner and automated PostgreSQL integration tests are still required before application code relies on this schema.

## Schema overview

- users: unique OIDC issuer/subject pair and account status.
- sessions: SHA-256-sized opaque-token hash, expiry, revocation, and user relationship.
- cases: owner, purpose, subject descriptor, lifecycle status, and optional retention deadline.
- evidence_items: provenance, review state, limitations, correction/retraction metadata.
- report_versions: versioned JSON report snapshots, scoped to cases.
- audit_events: minimized event metadata for access and lifecycle actions.

Application code must authorize every case/evidence/report operation against the authenticated owner. UUIDs are identifiers, not authorization. The database schema is not a substitute for authorization tests. Before production, add and test a migration ledger/runner, least-privilege database roles, backup restoration, retention/deletion behavior, and access-control integration tests.
