# Product Requirements

## Purpose

Tracelynt is an evidence-led research workspace. It should help users answer bounded questions using appropriately sourced information without overstating what the information proves. Traceability and safe handling take priority over invasive lookup capabilities.

## Intended users and use cases

- Individuals checking suspicious calls, messages, links, or business claims.
- Security researchers documenting public indicators.
- Analysts conducting proportionate business or website due diligence.
- Authorized teams maintaining case notes and evidence histories.

Example tasks include number normalization, public domain checks, official-source business checks, evidence organization, and reports with sources and limitations.

## Out of scope

- Unauthorized access to private telecom subscriber databases, call/SMS records, or protected identity systems.
- Private-person live-location tracking or surveillance.
- Bypassing authentication, accessing private accounts, or obtaining credentials.
- Publishing unverified accusations as facts.
- Face recognition or identity claims based solely on images.
- Automated high-impact decisions about employment, credit, housing, healthcare, or eligibility.

## MVP scope

### P0 — foundation
- Define evidence records and provider-adapter contracts.
- Establish authentication, authorization, validation, quotas, audit events, and secret handling before connecting providers.

### P1 — public web and domain checks
- Validate domains and URLs.
- Check DNS and TLS metadata through safe, bounded requests.
- Defend against SSRF, private-network access, redirect abuse, and DNS rebinding.
- Include source, retrieval time, status, and limitations for each observation.

### P1 — phone-number parsing
- Normalize numbers with a maintained numbering-plan library.
- Report syntax and numbering region as metadata, not identity.
- Display carrier or line-type data only from an approved provider, with source and timestamp.
- Never infer subscriber name, address, ownership, or current location from number metadata.

### P2 — evidence workspaces
- Create private cases with access controls.
- Store source references and bounded notes.
- Maintain observation and correction history.
- Audit sensitive access and exports.
- Apply retention and deletion rules.

### P2 — business checks and reports
- Prefer official websites, registries, and reputable public directories.
- Separate source-confirmed details from analyst interpretation.
- Include scope, sources, timestamps, limitations, and a correction route.

Scam-report intake and additional providers require separate abuse, privacy, legal, reliability, and cost review.

## Evidence model

Each observation should include:
- Unique ID and optional case reference.
- Subject type and normalized query, protected by access controls.
- Neutral claim or observation.
- Source name and canonical URL or provider reference.
- Retrieval timestamp and source publication/update time when available.
- Evidence category: provider data, public record, direct observation, user report, or analyst assessment.
- Verification state: unreviewed, corroborated, disputed, unavailable, or retracted.
- Confidence rationale, limitations, conflicts, and freshness guidance.
- Provenance identifying the provider or analyst who created the record.

Do not present confidence as a probability without a validated statistical basis. Correlation alone does not prove that records refer to the same person.

## Functional requirements

- FR-01: validate input before provider or network access.
- FR-02: return structured results with provenance and explicit partial-failure states.
- FR-03: never turn a missing result into a negative finding.
- FR-04: distinguish number-control verification from legal identity or ownership.
- FR-05: label user reports separately from independently verified observations.
- FR-06: enforce authenticated, role-based case access server-side.
- FR-07: log sensitive access and exports without logging secrets.
- FR-08: support correction, dispute, and deletion workflows.
- FR-09: enforce per-user and per-provider limits, quotas, and timeouts.
- FR-10: preserve sources, timestamps, limitations, and report-generation time.
- FR-11: show stale, unavailable, and uncorroborated sources clearly.
- FR-12: minimize raw provider payloads and personal data returned to the frontend.

## Non-functional requirements

Security: least privilege, secure defaults, dependency review, secret scanning, and authorization tests.
Privacy: data minimization, purpose limitation, bounded retention, and access transparency.
Reliability: timeouts, bounded retries, circuit breakers, and honest partial results.
Maintainability: typed provider contracts, documented schemas, and automated tests.
Accessibility: keyboard navigation, semantic controls, readable contrast, and understandable errors.
Performance: set measurable targets after the initial vertical slice; do not claim unmeasured targets.

## First vertical-slice acceptance criteria

- A user can submit a valid domain and receive bounded public technical observations.
- Invalid or disallowed destinations are rejected before network access.
- Every observation includes source and retrieval time.
- Timeouts and provider failures are represented honestly.
- Tests cover private IPs, localhost, redirects, malformed input, DNS changes, and authorization.
- Logs and errors do not disclose secrets or unnecessary personal data.
- Known limitations and prohibited uses are documented.