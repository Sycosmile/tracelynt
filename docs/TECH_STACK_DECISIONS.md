# Technology Decisions for the Private Case Workspace

## Status

Provisional implementation decisions for development. No hosting account, database, identity-provider project, or production environment has been configured. These decisions do not authorize storing real investigation data.

## Decision record

### Backend runtime — decided

Keep the existing Node.js 22+ backend and browser frontend for the first vertical slice. Do not migrate frameworks as part of the security work. Add only dependencies needed for PostgreSQL access, migrations, schema validation, and OIDC/session handling; pin versions and commit the lockfile.

### Database — decided for development

Use PostgreSQL. Develop locally first, using a local PostgreSQL instance (Docker Compose is the preferred reproducible option) and synthetic test data. Use checked-in, versioned SQL migrations; do not rely on manual dashboard edits. Keep the database private to the application and bind local development services to localhost.

Use a dedicated least-privilege application role at runtime. Migration credentials must be separate from runtime credentials. Parameterize queries and enforce case ownership in every query/service operation.

### Authentication — OIDC protocol implemented; provider still not approved

Use OpenID Connect through a maintained client library and a server-managed, opaque session stored in PostgreSQL. Do not implement password storage, token signing, or cryptographic primitives from scratch. Store only a hash of the opaque session token. Set cookies Secure, HttpOnly, and SameSite in deployed environments; add CSRF protection for state-changing cookie-authenticated requests.

The backend now has a configurable discovery-based OIDC authorization-code flow using the maintained openid-client library, state, nonce, PKCE, a browser-binding cookie, hashed opaque sessions, expiry/revocation, and CSRF checks. PostgreSQL-backed case/evidence/report services and owner-scoped audit writes are implemented. Automated tests use synthetic identities; real provider credentials are not required in CI.

**Open gate:** choose a real OIDC provider only after reviewing account recovery, allowed sign-in methods, callback configuration, cost, data processing terms, and account deletion. No provider is configured or approved by this document.

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

1. Completed: local PostgreSQL configuration, migration runner, checksum ledger, and schema migrations.
2. Completed in the backend: configurable OIDC flow, hashed sessions, expiry/revocation, and CSRF checks; provider credentials remain unconfigured.
3. Implemented: owner-scoped case/evidence APIs, immutable report snapshots, and transactionally recorded audit events.
4. In progress: run the PostgreSQL integration workflow and resolve any failures.
5. Completed: connect the frontend to sign-in/session/case APIs, saved report versions, export, and deletion-request controls.
6. Next: confirm the newest full CI workflow is green, then implement scheduled retention enforcement and backup expiry; real provider setup and end-to-end login verification remain blocked on provider selection.
7. Before production: select and review the identity provider and host, add least-privilege runtime DB roles, backup/restore tests, distributed rate limiting, and operational monitoring.

## Release blockers

- Cross-user and child-resource authorization tests must pass.
- CSRF, session expiry/revocation, account suspension, and export authorization must be tested.
- Deletion must cover evidence, report versions, derived caches, and export links, with backup expiry documented.
- Audit events must not contain secrets or unnecessary personal data.
- Database backup restoration and migration rollback must be exercised.
- Hosting, provider terms, data processing, jurisdictional privacy obligations, incident ownership, and retention periods must be reviewed before real data is accepted.
