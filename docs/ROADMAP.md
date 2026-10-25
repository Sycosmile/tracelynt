# Roadmap

Items are proposals, not completed features unless implemented and tested. Checkboxes describe repository implementation status, not production approval.

## Phase 0 — foundation

- [x] Define product purpose and initial scope.
- [x] Document architecture, security, governance, and roadmap.
- [x] Choose the initial runtime, database, and authentication protocol.
- [ ] Select a production hosting target and identity provider.
- [ ] Define contribution rules, license, and security contact.
- [x] Add CI for syntax checks, unit tests, and PostgreSQL integration tests.
- [ ] Add dependency review, lockfile enforcement, and secret scanning.

Exit criteria: reviewed requirements, explicit provisional stack decisions, clean CI baseline, and no secrets committed.

## Phase 1 — safe domain-intelligence vertical slice

- [x] Implement domain normalization and input validation.
- [x] Implement bounded DNS/TLS checks with public-destination validation.
- [x] Build a same-origin search and results UI.
- [x] Return timestamped technical observations and explicit limitations.
- [x] Test domain validation and unsafe destination rejection.
- [ ] Expand adversarial SSRF testing and independently review network safeguards.
- [ ] Add richer partial-failure status and structured observation provenance.

Exit criteria: tests cover malicious destinations; internal targets cannot be reached; failures are not misrepresented as negative findings.

## Phase 2 — identity, cases, and auditability

- [x] Implement configurable OIDC authentication and server-side sessions.
- [x] Add owner-scoped private cases and evidence history.
- [x] Add tenant-isolation tests and audit events.
- [x] Add versioned case reports and audited report reads/exports.
- [x] Add account/case deletion requests and a guarded manual purge command.
- [ ] Choose and document retention periods before production.
- [ ] Add scheduled retention enforcement only after retention policy approval.
- [ ] Test deletion across backups and derived records once those systems exist.
- [ ] Configure a real OIDC provider and verify end-to-end login.

Exit criteria: cross-user access tests pass; access and retention behavior are verified; provider and deletion limitations are documented.

## Phase 3 — phone-number metadata

- [ ] Add numbering-plan parsing and normalization.
- [ ] Show only supported metadata with source and timestamp.
- [ ] Review provider terms, permissions, and retention.
- [ ] Distinguish number control from identity in UI and reports.
- [ ] Add rate limits and anti-enumeration controls.

Exit criteria: no private subscriber lookup, bulk enumeration, or unsupported identity claims.

## Phase 4 — business checks and reports

- [x] Add analyst-authored business/domain reports with source attribution and review states.
- [x] Add versioned private case evidence summaries.
- [ ] Integrate approved official/public business sources.
- [ ] Correlate observations while preserving provenance.
- [ ] Add correction/dispute review workflows.
- [ ] Test report access, expiration, and deletion against an approved policy.

Exit criteria: reports remain traceable and do not overstate evidence.

## Phase 5 — operational readiness

- [ ] Complete threat-model and independent security review.
- [ ] Add dependency, secret, and static analysis to CI.
- [ ] Exercise backup restoration and backup expiry.
- [ ] Document incident response and provider outage procedures.
- [ ] Complete privacy impact assessment and jurisdiction-specific legal review.
- [ ] Configure distributed rate limiting, operational monitoring, and alerting.
- [ ] Review hosting, identity provider, and data-processing terms before handling real data.

Exit criteria: accountable owners, tested response procedures, and explicit production approval.

Security, lawful data access, source quality, and user privacy are release blockers, not post-launch enhancements. New data sources and identity-related features require documented review before implementation.
