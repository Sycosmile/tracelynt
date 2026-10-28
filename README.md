# Tracelynt

**Follow the evidence.**

Tracelynt is an evidence-led intelligence and verification workspace for researching public information, documenting findings, and assessing claims with transparent sources and limitations.

> **Status: development prototype.** The repository contains a domain-intelligence API, analyst-supplied report builder, PostgreSQL schema, configurable OIDC login, server-side sessions, and owner-scoped case/evidence/report APIs. It is not production-ready; no real identity provider or production environment is configured.

## Current implementation

- Domain normalization and validation.
- DNS A/AAAA, MX, and TXT observations.
- Phone-number syntax normalization for common Nigerian local formats and international-format inputs; no subscriber or carrier lookup.
- Public-web search links for business and organization names, with an explicit external-provider privacy notice.
- TLS certificate metadata from a validated public IPv4 address.
- Same-origin browser interface served by the backend.
- Request-size limits, no-store responses, CSP headers, and a basic in-memory per-IP rate limit.
- Evidence report builder for business/domain findings with source attribution, review states, timestamps, and explicit limitations.
- PostgreSQL migrations for users, sessions, login transactions, cases, evidence, report versions, and audit events.
- Configurable OpenID Connect authorization-code flow with state, nonce, PKCE, opaque server-side sessions, hashed session tokens, logout revocation, and CSRF checks.
- Private case APIs for owner-scoped listing, creation, reading, updates, archive status, evidence records, versioned evidence summaries, audited report reads/exports, and confirmed deletion requests.
- Account deletion requests that revoke sessions and mark the account and its cases for deletion, plus a guarded operator purge command.
- PostgreSQL-backed CI coverage for migration repeatability, rollback, checksum protection, and two-user case isolation.

## Important limitations

- No identity provider credentials, provider account, hosted database, or production deployment is configured.
- The frontend includes sign-in, case/evidence management, saved report versions, audited exports, and deletion-request controls. End-to-end sign-in still requires an operator-configured OIDC provider and has not been tested against real provider credentials.
- A case deletion request marks the case as `deletion_pending` and hides it from normal access; scheduled physical deletion, backup expiry, and an approved retention policy are not implemented.
- Automated retention enforcement, distributed rate limiting, backup expiry/restoration, and a scheduled purge remain outstanding. The manual purge command deletes pending records from the primary database only.
- The existing `/api/report` endpoint creates an in-memory report from analyst-supplied data; case reports are persisted as immutable version snapshots.
- GitHub Actions is configured to run backend checks and PostgreSQL integration tests. Check the [Actions page](https://github.com/Sycosmile/tracelynt/actions) for the current result. Local tests that require PostgreSQL still need a reachable database.

See the [Product Roadmap](docs/ROADMAP.md), [Backend](backend/README.md), [Database setup](backend/db/README.md), [Product requirements](docs/PRODUCT_REQUIREMENTS.md), and [Security design](docs/CASE_WORKSPACE_DESIGN.md).

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

- `backend/`: domain-intelligence API, auth/session modules, case services, migrations, and tests
- `frontend/`: responsive domain-inspection interface and evidence report builder
- `docs/PRODUCT_REQUIREMENTS.md`: scope and acceptance criteria
- `docs/ARCHITECTURE.md`: implemented design and network safeguards
- `docs/SECURITY.md`: threat model and security baseline
- `docs/DATA_GOVERNANCE.md`: privacy, data handling, and retention
- `docs/CASE_WORKSPACE_DESIGN.md`: private workspace design and security constraints
- `.env.example`: placeholder configuration template
- `.gitignore`: excludes local secrets and investigation data

## Development

Requirements for the public domain-inspection prototype: Node.js 22+ and npm. You can install dependencies and run the backend without installing Docker or PostgreSQL; domain checks and the non-persistent report builder do not require the case database.

From the repository root:

    cd backend
    npm install
    npm run check
    npm start

Open `http://127.0.0.1:8000`. Keep the service local and use synthetic data only.

**Private workspace setup requires PostgreSQL and the `psql` client.** You can use PostgreSQL installed locally, Docker Compose, or a properly configured hosted development database. Set `DATABASE_URL`, apply migrations with `npm run migrate`, and configure the OIDC environment variables before testing sign-in or database-backed case features. See [backend setup](backend/README.md) and [database setup](backend/db/README.md). Tests requiring PostgreSQL must run with a test database; GitHub Actions provides one for integration CI.

## Responsible-use boundary

Tracelynt is intended for legitimate fraud prevention, security research, business due diligence, and evidence organization. It must not enable stalking, doxxing, harassment, discrimination, unauthorized surveillance, or attempts to obtain protected identity or telecom records.

## Contributions

Changes should explain purpose, data sources, privacy impact, tests, and new security assumptions.

## License

No license has been selected. Do not assume that public availability grants permission to reuse, redistribute, or commercially exploit this repository.
