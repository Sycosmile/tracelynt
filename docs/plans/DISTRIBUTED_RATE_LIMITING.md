# Distributed rate limiting — implementation contract

## Current state

The API currently uses process-local counters. Limits reset on process restart and are not shared across workers or replicas. This document is a design contract only; distributed enforcement is not implemented by this change.

## Required behavior

- Use an atomic shared-store operation for each limit decision; never implement read-then-write counters.
- Define separate policies for unauthenticated domain checks, phone-format checks, authenticated workspace reads, mutations, login initiation, and exports.
- Key authenticated actions by stable user ID and include IP-based abuse controls where appropriate. Do not place raw phone numbers, search terms, or other personal data in keys.
- Use a documented fixed-window or sliding-window algorithm, explicit TTLs, and bounded key cardinality.
- Define fail-closed behavior for authentication, account mutation, and expensive operations. Any fail-open exception must be explicitly approved and observable.
- Return consistent 429 responses and bounded Retry-After values.
- Ensure client-supplied forwarding headers are trusted only behind explicitly configured trusted proxies.

## Backend decision required

Select a managed Redis-compatible service or another shared atomic store after reviewing hosting compatibility, availability, cost, data-processing terms, network access, and operational ownership. Do not silently add a mandatory service before that decision.

## Acceptance tests

- Two independent API instances share counters.
- Concurrent requests cannot exceed a configured limit due to race conditions.
- Expired counters reset correctly.
- Authenticated user limits remain stable across IP changes while IP abuse limits still apply.
- Spoofed forwarding headers cannot evade limits.
- Store timeout/outage follows the documented per-route failure policy.
- Metrics expose decisions and backend health without logging personal input.

## Rollout

1. Choose and provision the backend.
2. Add configuration validation and a local development profile.
3. Implement atomic limiter operations and unit/integration tests.
4. Shadow-compare existing and shared decisions without changing enforcement.
5. Enable enforcement gradually and alert on backend errors.
