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
- [x] Add structured observation provenance and distinguish empty DNS results from lookup failures; retain partial-check error details.
- [ ] Expand adversarial SSRF testing and independently review network safeguards.

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

- [x] Add numbering-plan parsing and normalization using maintained libphonenumber-js/max metadata; validity is not subscriber or identity verification.
- [x] Add a phone-format lookup interface with normalization and explicit limits (not a numbering-plan database).
- [x] Add public-web search links for business/organization names with visible external-provider handoff and privacy notice.
- [ ] Support combined name-and-number research without treating a match as identity proof.
- [x] Show supported numbering-plan metadata with source and timestamp.
- [ ] Review provider terms, permissions, and retention.
- [ ] Distinguish number control from identity in UI and reports.
- [x] Add bounded per-address rate limiting to phone-format checks; bulk enumeration remains unsupported.

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


## Product strategy — investigator-focused direction

**Product promise:** Follow the evidence. Understand the connections. Defend the conclusion.

Tracelynt is an evidence-led digital investigation workspace for OSINT analysts, digital investigators, security researchers, and authorized due-diligence teams. Its differentiator is not the number of lookup tools; it is the ability to trace material conclusions to observations, understand relationships and changes over time, and produce reviewable reports.

### Signature capabilities

1. **Case-scoped evidence graph:** entities and typed relationships are attached to supporting observations. Analyst hypotheses are visually distinct from direct observations and source-reported claims.
2. **Temporal investigation timeline:** preserve observation time, source publication/update time when known, and retrieval time separately. Show stale, conflicting, unavailable, corrected, and retracted records.
3. **Evidence provenance:** each observation identifies source/provider, category, retrieval time, review state, freshness, limitations, and provenance. No result is not the same as a negative finding.
4. **Reproducible reports:** immutable versions preserve scope, methodology, source references, evidence and relationship snapshots, limitations, conflicts, and unresolved questions.
5. **Guided pivots:** suggest proportionate next research steps based on evidence gaps and explain what each step can and cannot establish.
6. **Privacy and accountability:** private-by-default cases, server-side authorization, purpose limitation, audit trails, correction/dispute routes, approved retention, and controlled exports.
7. **Replaceable provider adapters:** normalize successful, partial, stale, rate-limited, and failed provider responses consistently.

### Ambitious roadmap and planning estimates

These estimates are provisional for a solo developer and must be revised from measured progress. They are not delivery promises.

- **Phase 0 — baseline and release blockers (2–4 weeks):** recheck branch, dependencies, tests, migrations and CI; define observation/provider contracts; configure and test a real OIDC provider; review authorization, SSRF, secrets, quotas, distributed rate limiting, retention, backup lifecycle, incident response, and production security/privacy gates.
- **Phase 1 — evidence ingestion and reliable intelligence (2–4 weeks):** shared observation schema, adapter interface, maintained phone-number metadata, reviewed public technical sources, freshness and partial-result semantics, and failure-path tests.
- **Phase 2 — graph and timeline (3–5 weeks):** case-scoped entities, evidence-backed typed relationships, hypothesis labels, chronology, conflicts, correction/retraction history, and report snapshots.
- **Phase 3 — analyst workflow and reports (2–4 weeks):** investigation templates, evidence-gap-driven pivots, HTML/PDF exports, report comparison, audited exports, and accessibility improvements.
- **Phase 4 — controlled beta and advanced capabilities (3–6+ weeks):** provider monitoring and cost controls, explicit team roles/sharing, scoped API/CLI access, provider evaluation, and independent security/privacy review.

### Current implementation checkpoint — 2026-10-28

- [x] Pin this investigator-focused strategy in this roadmap and link it from the README.
- [x] Add a dependency-free observation normalizer with a versioned schema, source/provenance fields, separate observation and retrieval times, freshness/review states, limitations, and source URL checks.
- [x] Add unit tests for valid records, required provenance, unsupported states, unsafe source URLs, timestamps, and limitations.
- [x] Include the new module in the syntax-check command.
- [x] Run the observation normalizer tests in CI and fix failures.
- [x] Wire normalized observations into domain lookup, private case persistence, and versioned report snapshots.
- [x] Add a versioned provider-result contract with distinct success, empty, partial, stale, rate-limited, unavailable, and error outcomes; validate freshness, timestamps, bounded errors, and retry guidance.
- [x] Adopt the provider-result contract in DNS A/AAAA, MX, TXT, and TLS domain checks while preserving existing response fields for compatibility.
- [ ] Adopt the provider-result contract in the phone-number metadata adapter and future external providers.

### First implementation slice

1. Add a dependency-free, versioned observation normalizer/validator with deterministic tests.
2. Define consistent provider-adapter result and failure conventions.
3. Implement a phone-number numbering-metadata lookup using a maintained library and reviewed sources.
4. Save a validated observation to an authorized private case and include it in a versioned report.
5. Re-run tests and inspect the complete diff before proceeding to graph schema/UI.

The shared observation contract is groundwork, not a live provider integration or a production-readiness claim.

### Boundaries

- No unauthorized telecom subscriber databases, call/SMS records, private account access, or live-location tracking.
- NIN format validation is not identity verification. Real verification requires authorized access, an appropriate purpose, and consent/privacy controls.
- Do not infer identity from a single shared attribute or present user reports as verified facts.
- Do not present arbitrary confidence percentages without a validated statistical basis.
- Public availability alone does not justify collection, combination, retention, or republication.
- Avoid bulk enumeration of people or phone numbers; enforce purpose limitation, quotas, and audit controls.

### Success measures

Establish baselines before setting numeric targets: provenance completeness, relationship traceability, cross-user authorization coverage, provider failure/freshness behavior, report reproducibility, deletion correctness across records and backups, and investigator task completion. Do not claim accuracy or performance improvements without a defined evaluation set and baseline.
