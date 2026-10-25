# Private Case Workspace — Architecture and Security Design

## Status

**Design proposal only.** Authentication, database persistence, private cases, audit logging, and deletion workflows are not yet implemented. Do not store real personal or investigation data in the current prototype.

## Decision summary

| Area | Recommendation | Rationale |
| --- | --- | --- |
| Runtime | Keep the existing Node.js 22+ backend for the first case-workspace slice | Minimizes migration risk and preserves the domain/report prototype. |
| Database | PostgreSQL with versioned migrations | Transactions and relational constraints suit ownership, evidence, and audit history. |
| Authentication | Use a maintained OpenID Connect (OIDC) identity provider; do not build password handling from scratch | Reduces credential-handling risk. Select a provider only after reviewing data location, recovery, cost, export, and deletion terms. |
| Browser session | Server-managed session with a high-entropy opaque ID in a Secure, HttpOnly, SameSite cookie | Avoids bearer tokens in browser local storage and supports revocation. |
| Authorization | Deny by default; enforce ownership in the API and each database query | Prevents insecure direct object references (IDOR/BOLA). |
| Sharing | Out of scope for the first release | Prove ownership isolation before adding multi-party access. |
| Evidence/report storage | Persist normalized evidence and versioned reports; do not store full external pages by default | Preserves provenance while limiting unnecessary personal data. |
| Deployment | One application service plus managed PostgreSQL, TLS, managed secrets, restricted database networking, and backups | Keeps the initial operational model reviewable. |

These are recommendations, not evidence that an identity provider or hosting service has been selected. Do not begin implementation until the identity provider and database/deployment environment are documented.

## Scope

### Included in the first release

- Authenticated users can create, list, view, update, and archive their own cases.
- A case contains a subject descriptor, purpose, notes, evidence findings, and report metadata.
- Evidence preserves claim text, category, source reference, retrieval/creation timestamp, review state, limitations, and creator.
- Server-side authorization protects every case, evidence item, and report.
- Sensitive reads, mutations, exports, and deletion requests create minimized audit events.
- Retention, correction, and deletion workflows are implemented before production use.
- Automated tests prove that one user cannot access or mutate another user's case by changing IDs.

### Explicitly excluded

- Public/shared case links, team collaboration, administrator browsing of case contents, bulk people/phone searches, private subscriber data, call/SMS records, and live-location features.
- Automatic identity resolution or a definitive “scammer” score.
- Arbitrary URL fetching or provider access from the case API.
- Production use with real sensitive records before privacy/security review.

## Logical architecture

Browser UI → same-origin API → authentication middleware → authorization-aware case service → PostgreSQL.

The domain inspection service and report generator remain separate modules. Provider integrations must use explicit adapters and approved destination controls. A request must not pass an arbitrary URL to a privileged fetcher.

### Request order

1. Enforce method, content type, body-size, and request-rate limits.
2. Validate the session and confirm the account is active.
3. Parse and validate the request with a runtime schema.
4. Authorize the action against the requested resource and current user.
5. Execute a parameterized, tenant-scoped query or transaction.
6. Write required audit events in the same transaction for sensitive mutations.
7. Return only fields required by the UI; use Cache-Control: no-store for private responses.

An absent, invalid, expired, or revoked session must never fall back to anonymous access to case endpoints. Errors should not reveal whether another user's case ID exists.

## Data model

Use server-generated UUIDs for externally visible identifiers. IDs are not authorization credentials.

### users

- Internal UUID primary key.
- Unique identity-provider issuer and subject pair.
- Account status (active, suspended, deletion-pending).
- Minimal timestamps and account metadata.
- Avoid copying profile attributes the product does not need.

### sessions

- Store a hash of a high-entropy opaque session token, never the raw token.
- Record user ID, creation/expiry/revocation timestamps, and minimal security metadata.
- Rotate at authentication and privilege changes; revoke on logout, suspension, or security events.

### cases

- ID, owner user ID, title, purpose, subject type, and subject label.
- Status (open, archived, deletion-pending), timestamps, and retention deadline.
- Restrictive foreign key to the owner; no public-by-default field or share token.
- Collect only the minimum subject information. Discourage unnecessary government IDs, home addresses, and other sensitive identifiers.

### evidence_items

- ID, case ID, creator ID, claim, category, and review state.
- Source name, nullable canonical source URL, observed/created/updated timestamps, limitations, and correction/retraction metadata where required.
- Keep direct observations distinct from analyst assessments and allegations.
- Store bounded excerpts or normalized observations, not entire source pages or raw provider payloads by default.

### report_versions

- ID, case ID, creator ID, version number, generation timestamp, report data, and deletion state if required by the retention workflow.
- Enforce unique case/version pairs. Preserve evidence references and caveats for each generated version.
- Never expose reports through public or guessable URLs.

### audit_events

- Actor ID where available, action, resource type and ID, timestamp, outcome, and request correlation ID.
- Record access, creation/update, archive, export, correction, deletion, and access-control events.
- Do not record claim text, full source URLs with query parameters, session tokens, credentials, or unnecessary personal data.
- Restrict audit-table access separately from ordinary case access. Do not call logs tamper-proof unless storage and operational controls justify that claim.

Recommended initial indexes: cases by owner and update time; evidence by case and creation time; report versions by case and version; audit events by actor/resource/time. Confirm indexes against real query plans as usage grows.

## Authorization rules

- Every case operation requires an authenticated, active user.
- Every read or mutation scopes the case by both case ID and the authenticated owner ID. Do not fetch globally and rely on the UI to hide unauthorized data.
- Evidence and report operations must prove that the parent case belongs to the current user within the same query or transaction.
- Never trust client-supplied owner IDs, role, creator IDs, or authorization flags.
- A random UUID does not replace an authorization check.
- Return a consistent not-found response for nonexistent and non-owned private resources where practical.
- Do not add support/admin impersonation or broad staff access in the first release.
- If collaboration is later introduced, model explicit grants and roles, audit grant changes, and test revocation before enabling sharing.

Illustrative query pattern:

    SELECT id, title, purpose, status, created_at, updated_at
    FROM cases
    WHERE id = $1 AND owner_user_id = $2;

The owner ID must come from the authenticated server-side session, never from request JSON.

## Session and browser protections

- Use TLS in deployment; set cookies Secure, HttpOnly, and with an appropriate SameSite policy.
- Keep session/provider tokens out of local storage, URLs, logs, analytics, and error reports.
- Validate OIDC issuer, audience, signature, state, nonce, and redirect URI using a maintained library.
- Use CSRF protection for state-changing cookie-authenticated requests; validate Origin/Referer as an additional layer, not the sole control.
- Apply a restrictive Content Security Policy and avoid unsafe HTML insertion.
- Use explicit CORS allowlists; never combine credentialed requests with wildcard origins.
- Rate-limit authentication callbacks, case creation, searches, and exports. Add account-level limits as well as IP-level controls.
- Ensure reverse-proxy configuration cannot spoof trusted client IP headers.

## Transactions and audit behavior

- Create/update/archive operations and their audit event should commit atomically where feasible.
- Failed authorization attempts may be logged as security events, without resource contents.
- Export events record actor, report/case reference, timestamp, and outcome, not the report body.
- For security-sensitive mutations, fail closed if a required audit write cannot be persisted.
- Keep application logs separate from audit events. Redact request bodies, cookies, authorization headers, and personal data.

## Retention, correction, and deletion

Before production, define concrete retention periods for cases, evidence, reports, audit records, sessions, backups, and security logs. Do not retain data indefinitely by default.

Deletion workflow requirements:
1. Require an authenticated owner and explicit confirmation.
2. Mark the case deletion-pending and block ordinary access.
3. Delete or irreversibly anonymize associated evidence, reports, and derived caches according to the documented policy.
4. Revoke related export links and sessions where relevant.
5. Record a minimized deletion event without retaining deleted content.
6. Document backup expiry and any lawful/security retention exception, including an owner and review date.

Provide correction and dispute workflows for findings. Preserve only the minimum correction/retraction history needed for integrity and accountability. Do not silently rewrite historical report versions without indicating the change.

## Migration and release sequence

1. **Decision gate:** choose the OIDC provider, PostgreSQL host, deployment target, retention periods, and security contact.
2. Add database migrations and synthetic test fixtures; keep credentials out of the repository.
3. Implement authentication/session middleware and negative tests before case UI.
4. Implement case CRUD with owner-scoped service methods.
5. Add evidence and report persistence while preserving provenance fields.
6. Add audit events, archive/delete/correction flows, and retention enforcement.
7. Build browser UI only after API authorization tests are in place.
8. Run unit, integration, and end-to-end tests, including two-user isolation, CSRF/session revocation, export access, deletion, and migration rollback.
9. Review logs, deployment secrets, backups/restoration, and privacy controls before using real records.

Do not store sensitive investigation records during the implementation sequence in a publicly deployed environment. The current prototype remains a local/demo tool until release gates are satisfied.

## Acceptance criteria

- Unauthenticated requests cannot access case endpoints.
- User A cannot list, read, update, archive, export, or delete User B's case, evidence, or reports, even with valid resource IDs.
- A child resource cannot be accessed through a case owned by another user.
- Session expiry, logout, revocation, and account suspension take effect server-side.
- CSRF and cross-origin tests cover state-changing requests.
- Private responses are not cached by browsers or intermediaries.
- Audit events are emitted for defined sensitive actions and contain no session secrets or unnecessary personal data.
- Deletion and retention tests cover related evidence, reports, caches, exports, and documented backup limits.
- Migrations work on a clean database and can be tested in CI with synthetic data.
- Provider failures, missing sources, and allegations are not converted into definitive negative findings or identity claims.

## Open decisions

These must be resolved before implementation:

- Which OIDC provider meets budget, region, account-recovery, and data-processing needs?
- Which PostgreSQL host and deployment environment will be used?
- What retention periods apply to cases, reports, audit events, and backups?
- Who owns security incidents and privacy requests?
- Is the first release single-user only, with no case sharing? Recommendation: yes.
