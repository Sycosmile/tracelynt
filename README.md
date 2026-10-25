# Tracelynt

**Follow the evidence.**

Tracelynt is an evidence-led intelligence and verification workspace for researching public information, documenting findings, and assessing claims with transparent sources and limitations.

> **Status: development prototype.** The repository contains a domain-intelligence API, analyst-supplied report builder, PostgreSQL schema, configurable OIDC login, server-side sessions, and owner-scoped case/evidence/report APIs. It is not production-ready; no real identity provider or production environment is configured.

## Current implementation

- Domain normalization and validation.
- DNS A/AAAA, MX, and TXT observations.
- TLS certificate metadata from a validated public IPv4 address.
- Same-origin browser interface served by the backend.
- Request-size limits, no-store responses, CSP headers, and a basic in-memory per-IP rate limit.
- Evidence report builder for business/domain findings with source attribution, review states, timestamps, and explicit limitations.
- PostgreSQL migrations for users, sessions, login transactions, cases, evidence, report versions, and audit events.
- Configurable OpenID Connect authorization-code flow with state, nonce, PKCE, opaque server-side sessions, hashed session tokens, logout revocation, and CSRF checks.
- Private case APIs for owner-scoped listing, creation, reading, updates, archive status, evidence records, versioned evidence summaries, and confirmed deletion requests.
- PostgreSQL-backed CI coverage for migration repeatability, rollback, checksum protection, and two-user case isolation.

## Important limitations

- No identity provider credentials, provider account, hosted database, or production deployment is configured.
- The browser interface has not yet been wired to the private case APIs; those APIs currently require a client to handle login, session/CSRF retrieval, and JSON requests.
- A case deletion request marks the case as deletion_pending and hides it from normal access; scheduled physical deletion, backup expiry, and a retention policy are not implemented.
- Account deletion, automated retention enforcement, distributed rate limiting, and backup restoration drills remain outstanding.
- The existing /api/report endpoint creates an in-memory report from analyst-supplied data; case reports are persisted as immutable version snapshots.
- CI is configured to test against PostgreSQL, but the latest workflow result must be checked before claiming the tests passed.

See [Backend](backend/README.md), [Database setup](backend/db/README.md), [Product requirements](docs/PRODUCT_REQUIREMENTS.md), and [Security design](docs/CASE_WORKSPACE_DESIGN.md).

## Product direction

- Phone-number intelligence based on numbering plans and reviewed providers.
- Public-source research with links to original sources.
- Business and website checks based on appropriately sourced information.
- Analyst-authored evidence reports; official registry/provider integrations remain unconfigured.
- Evidence correlation with timestamps, source attribution, uncertainty, and correction history.
- Private investigation workspaces with controlled access.

## Principles

1. Evidence before conclusions: material findings identify source, retrieval time, and limitations.
2. No invented certainty: a number, username, photo, or name match is not proof of identity.
3. Privacy by design: minimize collection, restrict access, and set retention limits.
4. Lawful sources only: no unauthorized telecom subscriber databases, call records, private account access, or live-location tracking.
5. Allegations are not facts: user-submitted scam reports remain unverified unless independently substantiated.
6. Safe failure: unavailable or unverified results must be labelled honestly.
7. Accountability: support corrections, source review, audit logs, and abuse reporting.

## Repository layout

- backend/: domain-intelligence API, auth/session modules, case services, migrations, and tests
- frontend/: responsive domain-inspection interface and evidence report builder
- docs/PRODUCT_REQUIREMENTS.md: scope and acceptance criteria
- docs/ARCHITECTURE.md: design and network safeguards
- docs/SECURITY.md: threat model and security baseline
- docs/DATA_GOVERNANCE.md: privacy, data handling, and retention
- docs/CASE_WORKSPACE_DESIGN.md: private workspace design and security constraints
- .env.example: placeholder configuration template
- .gitignore: excludes local secrets and investigation data

## Development

Requirements: Node.js 22+, Docker Compose or PostgreSQL 17, and the PostgreSQL psql client for migrations. Backend dependencies include pg and openid-client.

From the repository root, start the local database:

    docker compose up -d postgres

From backend, install dependencies, configure local environment variables, apply migrations, then run checks:

    npm install
    npm run migrate
    npm run check
    npm test
    npm start

The server binds to 127.0.0.1:8000 by default. See [backend setup](backend/README.md) for OIDC configuration. Keep the service local during development and use synthetic data only.

## Responsible-use boundary

Tracelynt is intended for legitimate fraud prevention, security research, business due diligence, and evidence organization. It must not enable stalking, doxxing, harassment, discrimination, unauthorized surveillance, or attempts to obtain protected identity or telecom records.

## Contributions

Changes should explain purpose, data sources, privacy impact, tests, and new security assumptions.

## License

No license has been selected. Do not assume that public availability grants permission to reuse, redistribute, or commercially exploit this repository.
