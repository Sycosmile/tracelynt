# Security Baseline

## Status

This document records the current prototype's security posture and the controls still required before public deployment. Implemented controls are not a substitute for an independent security review. The application is not production-ready; use synthetic data only. Do not publish sensitive vulnerability details or real personal records in public issues.

## Current implemented controls

- Domain input normalization and rejection of URLs, IP literals, local/reserved names, and DNS results that are not public.
- Bounded DNS/TLS inspection without arbitrary webpage fetching or redirect following.
- Request body limits, no-store responses, content-security-policy headers, and an in-memory per-process rate limiter.
- Server-side OIDC flow structure with state, nonce, PKCE, hashed opaque sessions, expiry/revocation, and CSRF checks. Real provider credentials and end-to-end provider login are not configured.
- Owner-scoped case/evidence/report services, parameterized SQL, immutable report snapshots, and audit events for sensitive reads/exports.
- Deletion requests that revoke sessions as applicable and mark records pending; a guarded manual purge removes pending primary-database records but does not delete backup copies.
- CI checks for JavaScript syntax, unit/API tests, PostgreSQL migrations, migration rollback/checksum protections, and case-owner isolation.

The latest confirmed workflow result is recorded in the repository history; re-check GitHub Actions after code or workflow changes. Passing CI does not establish production readiness.

## Threat model

Assets: credentials and sessions, private cases and search history, provider keys and quotas, reports, audit records, and application integrity.

Threat actors: unauthenticated users, authenticated users attempting cross-user access, abusive users, malicious providers, attackers supplying crafted inputs, and compromised insiders or credentials.

Primary risks: broken object-level authorization, SSRF, injection and unsafe rendering, secret leakage, quota abuse and enumeration, misleading identity matches, unsubstantiated allegations, excessive retention, and supply-chain compromise.

## Required before public deployment

### Identity and access

- Select and review a maintained identity provider; configure and test real end-to-end sign-in.
- Re-test authorization server-side for every private object and child resource.
- Review secure session settings, CSRF protection, account recovery, and session revocation.
- Replace the process-local rate limiter with a distributed strategy and test authentication and sensitive-action limits.

### Input and network

- Continue validating inputs with explicit schemas and normalization.
- Parameterize database queries and treat provider data, source pages, reports, and uploads as untrusted.
- Expand adversarial SSRF tests for private/reserved IPs, redirects, DNS rebinding, IPv6, and metadata endpoints.
- Add network-level egress restrictions as defense in depth.
- Review request, response-size, connection, and execution-time limits.

### Secrets and dependencies

- Commit placeholders only; never real API keys or tokens.
- Keep local environment files out of version control.
- Use least-privilege provider credentials and rotate exposed secrets.
- Commit an npm lockfile and enforce reproducible installs in CI.
- Enable dependency review, secret scanning, and vulnerability alerts.

### Data protection

- Collect only information necessary for a defined purpose.
- Approve explicit retention deadlines before production and implement scheduled enforcement only after policy approval.
- Redact personal data from logs unless strictly necessary.
- Encrypt traffic in transit and use managed storage encryption where available.
- Review report export authorization, expiry, and deletion behavior.
- Exclude private data from analytics, traces, and error reports.
- Test backup restoration and define backup expiry/deletion procedures.

### Abuse prevention

- Do not support private subscriber lookup, call/SMS history, or live-location tracking without a separately reviewed lawful and authorized integration.
- Prevent bulk enumeration of phone numbers or people.
- Apply proportionate per-account, per-IP, and per-provider limits.
- Provide abuse reporting, correction, dispute, and review channels.
- Do not label someone a scammer based solely on a user report or weak signal.
- Review high-risk feature requests for legal, privacy, and abuse implications.

## Evidence integrity

Record source references and retrieval times. Separate direct observations from analyst conclusions. Preserve correction/retraction history where appropriate. Record who created or changed a finding. Never treat OTP control as legal identity or original ownership. Do not merge identities from one shared attribute.

## Security test checklist

- [x] Unit/API tests cover core input validation and safe error behavior.
- [x] PostgreSQL integration tests cover migration repeatability, rollback, checksum protection, and case-owner isolation.
- [x] Tests cover session expiry/revocation, suspended accounts, logout auditing, report read/export authorization, and deletion/purge behavior.
- [ ] Independent review of authentication, session handling, and every private object route.
- [ ] Expand SSRF tests for DNS rebinding, IPv6 edge cases, metadata endpoints, and network-level egress.
- [ ] Replace and test distributed rate limits and quotas.
- [ ] Run dependency and secret scans in CI with a committed lockfile.
- [ ] Verify logs and errors contain no secrets or unnecessary personal data.
- [ ] Test retention, export expiry, deletion propagation, and backup expiry/restoration after policy and infrastructure exist.
- [ ] Complete abuse-report, correction, dispute, incident-response, and recovery workflows.

## Vulnerability reporting

Do not publish sensitive vulnerability details or personal records in public issues. Configure a dedicated security contact and reporting channel before production release.
