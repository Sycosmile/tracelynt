# Architecture

## Status and goals

This document describes the current development prototype and distinguishes implemented controls from production requirements. The application is not production-ready and must use synthetic data only.

Goals: source traceability, replaceable providers, strict tenant isolation, untrusted-source handling, and transparent failures and uncertainty.

## Implemented components

Browser UI → same-origin Node.js HTTP API → input validation and bounded DNS/TLS inspection.

For private workspace routes, the API uses configurable OpenID Connect authentication, server-side session state, owner-scoped case/evidence/report services, PostgreSQL persistence, and audit events. The browser never calls privileged provider APIs directly.

The runtime is Node.js 22+ with a dependency-free HTML/CSS/JavaScript frontend and PostgreSQL for the private workspace. The OIDC protocol is implemented with a maintained client library, but no provider is selected or configured. PostgreSQL migrations are versioned SQL files. GitHub Actions runs backend checks and PostgreSQL integration tests.

## Current request lifecycle

1. Serve only explicitly allowlisted frontend assets or known API routes.
2. For private workspace operations, resolve the session and enforce same-origin CSRF checks for mutations.
3. Validate and normalize the input.
4. For domain inspection, resolve DNS and reject non-public or special-use destinations.
5. Collect bounded DNS observations and TLS certificate metadata without fetching arbitrary webpage content.
6. Return minimized observations with timestamps and limitations.
7. For case operations, enforce owner-scoped access and record minimized audit events for sensitive operations.
8. For reports, preserve source attribution and review states; case report versions are stored as immutable snapshots.

A provider or network failure must not become a negative finding. Partial results must identify incomplete checks. Analyst-supplied claims are not independently verified by report generation.

## Domain inspection and network safeguards

- Accept a normalized domain rather than an arbitrary URL.
- Reject localhost, local/reserved suffixes, IP literals, and DNS results that are private, reserved, or special-use.
- Validate all returned A/AAAA addresses before connecting.
- Connect TLS inspection to a validated public IPv4 destination while using the requested hostname for SNI.
- Do not follow redirects or fetch arbitrary web pages.
- Bound request bodies and use connection timeouts.
- Treat DNS/TLS results as point-in-time observations, not proof of business legitimacy or domain ownership.

These checks reduce SSRF exposure but still require adversarial testing and independent review before public deployment. Network-level egress restrictions should be added as defense in depth in a deployed environment.

## Private workspace and persistence

- PostgreSQL stores users, sessions, OIDC login transactions, cases, evidence items, report versions, and audit events.
- Session tokens are opaque and high-entropy; only their hashes are stored in the database.
- Session expiry/revocation and CSRF protections are implemented in the application.
- Every private case/evidence/report operation must be scoped to the authenticated owner; unknown and non-owned identifiers should not reveal object existence.
- Evidence includes source references, review state, limitations, and correction/retraction metadata.
- Case report versions are immutable snapshots; later evidence edits do not silently rewrite earlier reports.
- Deletion requests mark records pending and revoke sessions as applicable. A guarded operator command can purge pending primary-database rows, but there is no scheduled purge or approved retention period.
- Deleting primary-database rows does not erase backups. Backup expiry, restoration drills, and derived-data deletion are not implemented.

## Local development and testing

The public domain-inspection prototype and non-persistent report builder can run with Node.js and npm without a local database. Private workspace features require PostgreSQL, migrations, and a configured OIDC provider. Tests requiring PostgreSQL need a test database; CI provisions PostgreSQL for integration tests.

Use synthetic data only. Keep PostgreSQL bound to localhost during local development and never commit credentials.

## Production requirements not yet met

- Select and review a real OIDC provider and configure end-to-end sign-in.
- Choose hosting and a managed database with appropriate regional, contractual, and privacy review.
- Use separate least-privilege runtime and migration database roles.
- Add distributed rate limiting, operational monitoring, and alerting.
- Enforce approved retention periods and test deletion across records, exports, derived data, and backups.
- Exercise backup restoration and migration rollback procedures.
- Add dependency/secret scanning and lockfile-based reproducible installs.
- Complete privacy impact, incident response, and independent security reviews before handling real personal or investigation data.
