# Architecture

## Status and goals

This is a proposed architecture, not a description of an implemented system. Validate it with a small vertical slice before committing to a larger stack.

Goals: source traceability, replaceable providers, strict tenant isolation, untrusted-source handling, and transparent failures and uncertainty.

## Logical components

Browser UI → authenticated API → authentication and authorization → input validation and quotas → case/evidence services → provider orchestration → approved provider adapters → persistence and audit events.

A bounded job queue may support asynchronous checks. Provider secrets must remain server-side. The browser must never call privileged provider APIs directly.

## Suggested technology direction

- Frontend: TypeScript and a maintained web framework.
- API: TypeScript or Python, chosen based on the first vertical slice and team familiarity.
- Database: PostgreSQL or another relational database with migrations.
- Validation: runtime schemas at trust boundaries.
- Tests: unit, integration, authorization, and end-to-end coverage.
- Deployment: managed platform with TLS, secret management, logs, backups, and recovery procedures.

These are recommendations, not final stack decisions.

## Request lifecycle

1. Authenticate the requester.
2. Authorize the action and case scope.
3. Validate and normalize input.
4. Enforce quotas and provider policy.
5. Call the adapter with strict timeout and response-size limits.
6. Normalize results and discard unnecessary personal data.
7. Store provenance and a suitable audit event.
8. Return minimized results with source, timestamp, status, and caveats.

A provider failure must not become a negative finding. Partial results must identify incomplete checks.

## Provider adapter contract

Each adapter documents provider identity, permitted purpose, input schema, output fields, legal/contractual basis, timeout, retry policy, quotas, error categories, freshness, retention, and tests using synthetic fixtures.

Do not build a generic privileged fetcher for arbitrary URLs. Limit network capabilities to approved providers or validated destination classes.

## SSRF and network controls

For user-supplied domains or URLs:
- Allow only supported schemes.
- Reject localhost, private, link-local, multicast, reserved, and cloud metadata IP ranges.
- Resolve DNS and validate every resulting address before connecting.
- Revalidate redirects; disable them by default where practical.
- Mitigate DNS rebinding by pinning the validated destination.
- Block internal network access at egress firewall level as defense in depth.
- Bound response size, redirect count, connect time, total time, and content type.
- Never render fetched active content in the application origin.

## Core data entities

- User: identity-provider subject, status, minimal account metadata.
- Case: owner, purpose, access policy, creation time, retention deadline, status.
- EvidenceItem: case reference, claim, type, verification state, timestamps, caveats.
- Source: canonical URL/provider reference, source name, retrieval time, freshness metadata.
- ProviderRun: adapter, status, timing, bounded error category, correlation ID.
- AuditEvent: actor, action, target reference, timestamp, outcome, correlation ID.
- Report: case reference, generation time, version, export metadata.

Avoid personal data in URLs, log keys, metrics labels, or primary keys.

## Security and operations

- Enforce authorization on every private object at the service/data layer.
- Use tenant-scoped queries and test for insecure direct object references.
- Encrypt traffic in transit and use managed encryption at rest where available.
- Store secrets in a secret manager or untracked environment file.
- Define separate retention rules for records, backups, logs, and exports.
- Audit access, sharing changes, corrections, and exports.
- Before production, configure environment separation, dependency/secret scanning, tested backups, incident response, provider outage procedures, and measurable service targets.