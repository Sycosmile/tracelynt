# Backend

The backend has not been implemented yet.

## Responsibilities
- Authenticate requests and enforce server-side authorization.
- Validate and normalize inputs.
- Orchestrate approved providers through isolated adapters.
- Enforce timeouts, quotas, rate limits, response-size limits, and safe errors.
- Normalize results into evidence records with provenance and timestamps.
- Maintain audit events, retention rules, and correction/deletion workflows.
- Return minimized, typed responses to the frontend.

## Suggested modules
- api/: HTTP routes and request/response schemas.
- services/: use cases and business rules.
- providers/: reviewed provider adapters.
- evidence/: provenance and evidence normalization.
- persistence/: database models and migrations.
- security/: authorization, quotas, validation, and redaction.
- jobs/: bounded asynchronous tasks if needed.

These names are a starting point, not a fixed framework requirement.

## Provider adapter requirements

Each adapter documents source, permitted use, data fields, provenance, timeout, quota, freshness, failure modes, and retention. Keep credentials server-side. Do not add providers based on leaked private records or unclear data provenance.

## Testing requirements
- Unit tests for validation, normalization, evidence state, and confidence rationale.
- Integration tests with synthetic provider fixtures.
- Authorization tests across users, cases, and report exports.
- SSRF and network-boundary tests for URL-fetching features.
- Tests for timeouts, partial results, quota limits, and provider errors.
- Tests confirming logs omit secrets and unnecessary personal data.

No endpoint or provider integration should be considered production-ready until its tests and operational limits are documented.