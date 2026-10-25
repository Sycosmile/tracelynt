# Technology Decisions for the Private Case Workspace

## Status

Provisional implementation decisions for development. No hosting account, database, identity-provider project, or production environment has been configured. These decisions do not authorize storing real investigation data.

## Decision record

### Backend runtime — decided

Keep the existing Node.js 22+ backend and browser frontend for the first vertical slice. Do not migrate frameworks as part of the security work. Add only dependencies needed for PostgreSQL access, migrations, schema validation, and OIDC/session handling; pin versions and commit the lockfile.

### Database — decided for development

Use PostgreSQL. Develop locally first, using a local PostgreSQL instance (Docker Compose is the preferred reproducible option) and synthetic test data. Use checked-in, versioned SQL migrations; do not rely on manual dashboard edits. Keep the database private to the application and bind local development services to localhost.

Use a dedicated least-privilege application role at runtime. Migration credentials must be separate from runtime credentials. Parameterize queries and enforce case ownership in every query/service operation.

### Authentication — protocol decided; provider not yet approved

Use OpenID Connect through a maintained client library and a server-managed, opaque session stored in PostgreSQL. Do not implement password storage, token signing, or cryptographic primitives from scratch. Store only a hash of the opaque session token. Set cookies Secure, HttpOnly, and SameSite in deployed environments; add CSRF protection for state-changing cookie-authenticated requests.

Keep provider-specific discovery, callback, issuer/audience validation, state, nonce, and logout handling behind a small authentication module. Use a deterministic fake identity/session adapter in automated tests; never require real provider credentials in CI.

**Open gate:** choose a real OIDC provider only after reviewing account recovery, allowed sign-in methods, callback configuration, cost, data processing terms, and account deletion. Google OIDC may be evaluated as a simple initial login option, but it is not approved or configured by this document.

### Hosting — not approved for sensitive records

Keep the case-workspace development environment local until the authorization, retention, deletion, logging, and backup tests pass. Render is a candidate for hosting the Node service and PostgreSQL in the same region; Singapore is a candidate region for a Nigeria-based initial audience. This is not a final residency or compliance decision. Before selecting a host, compare current prices, region availability, backup/restore controls, network isolation, contractual terms, and the ability to delete data and backups according to policy.

Do not put private investigation records on free/sleeping prototype instances. A free tier may be used only with synthetic demo data and explicit awareness of its limitations. Do not deploy production case storage until the hosting and data-processing review is complete.

### Storage and data handling — decided

- No case data in browser local storage.
- No public case or report URLs.
- No full external-page snapshots by default.
- No personal data in logs, metric labels, error messages, or URL query strings.
- Store minimized evidence with source, timestamp, review state, and limitations.
- Use synthetic fixtures in CI; do not use real people or real allegations in tests.
- Retention periods remain an explicit pre-production decision; indefinite retention is not acceptable.

## Implementation order

1. Add local PostgreSQL development configuration and migration tooling.
2. Create migrations for users, sessions, cases, evidence, report versions, and audit events.
3. Implement and test database access with synthetic fixtures.
4. Implement OIDC/session interfaces and negative authorization tests; use a fake identity adapter for CI.
5. Add case service operations with owner-scoped queries and transactionally recorded audit events.
6. Implement retention, correction, archive, deletion, and export access rules.
7. Select and configure the real OIDC provider and hosted environment only after their review gates are complete.
8. Run integration tests against a clean PostgreSQL database before adding case UI.

## Release blockers

- Cross-user and child-resource authorization tests must pass.
- CSRF, session expiry/revocation, account suspension, and export authorization must be tested.
- Deletion must cover evidence, report versions, derived caches, and export links, with backup expiry documented.
- Audit events must not contain secrets or unnecessary personal data.
- Database backup restoration and migration rollback must be exercised.
- Hosting, provider terms, data processing, jurisdictional privacy obligations, incident ownership, and retention periods must be reviewed before real data is accepted.
