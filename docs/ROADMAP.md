# Roadmap

Items are proposals, not completed features unless implemented and tested.

## Phase 0 — foundation
- [x] Define product purpose and initial scope.
- [x] Document architecture, security, governance, and roadmap.
- [ ] Choose framework, runtime, database, and deployment target.
- [ ] Define contribution rules, license, and security contact.
- [ ] Add CI for formatting, linting, type checks, tests, and secret scanning.

Exit criteria: reviewed requirements, explicit stack decisions, clean CI baseline, no secrets committed.

## Phase 1 — safe domain-intelligence vertical slice
- [ ] Implement input schemas and domain normalization.
- [ ] Implement SSRF-resistant DNS/TLS checks with bounded network access.
- [ ] Normalize observations into a provenance-aware evidence schema.
- [ ] Return source, retrieval timestamp, partial-failure status, and limitations.
- [ ] Test malicious destinations and provider failures.
- [ ] Build a minimal search and results UI.

Exit criteria: end-to-end tests pass; internal targets cannot be reached; failures are not misrepresented as negative findings.

## Phase 2 — identity, cases, and auditability
- [ ] Add authentication and server-side authorization.
- [ ] Add private cases and evidence history.
- [ ] Add tenant-isolation tests and audit events.
- [ ] Define and implement retention, correction, and deletion workflows.

Exit criteria: cross-user access tests pass; access and retention are verified.

## Phase 3 — phone-number metadata
- [ ] Add numbering-plan parsing and normalization.
- [ ] Show only supported metadata with source and timestamp.
- [ ] Review provider terms, permissions, and retention.
- [ ] Distinguish number control from identity in UI and reports.
- [ ] Add rate limits and anti-enumeration controls.

Exit criteria: no private subscriber lookup, bulk enumeration, or unsupported identity claims.

## Phase 4 — business checks and reports
- [ ] Add approved official/public business sources.
- [ ] Correlate observations while preserving provenance.
- [ ] Generate reports with scope, sources, timestamps, rationale, and caveats.
- [ ] Add correction/dispute review.
- [ ] Test report access, expiration, and deletion.

Exit criteria: reports remain traceable and do not overstate evidence.

## Phase 5 — operational readiness
- [ ] Complete threat-model and independent security review.
- [ ] Add dependency, secret, and static analysis to CI.
- [ ] Exercise backup restoration.
- [ ] Document incident response and provider outage procedures.
- [ ] Complete privacy impact assessment and jurisdiction-specific legal review.
- [ ] Monitor costs, quotas, and abuse.

Exit criteria: accountable owners, tested response procedures, and explicit production approval.

Security, lawful data access, source quality, and user privacy are release blockers, not post-launch enhancements. New data sources and identity-related features require documented review before implementation.