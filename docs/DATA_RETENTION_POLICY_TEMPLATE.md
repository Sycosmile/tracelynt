# Data Retention Policy Template

## Status

**Draft template only — not an approved retention policy.** Tracelynt currently documents deletion requests and a guarded manual purge for primary-database records, but does not have an approved retention schedule, automated enforcement, backup expiry, or verified deletion from backups. Do not use real personal or investigation data until this policy is approved and the required controls are implemented and tested.

The project owner must complete the decisions below with qualified privacy/legal advice for each intended jurisdiction and deployment.

## Policy owner and review

- Policy owner: `[name / role]`
- Approver: `[name / role]`
- Effective date: `[YYYY-MM-DD]`
- Next review date: `[YYYY-MM-DD]`
- Applicable jurisdictions and legal basis: `[documented assessment]`
- Permitted purposes and prohibited uses: `[approved purposes]`
- Contact for access, correction, dispute, and deletion requests: `[private channel]`

Review this policy at least annually and whenever the data types, providers, deployment, or legal requirements change.

## Retention schedule

Do not leave a category without an owner, retention period, deletion method, and verification evidence. A retention period must be justified by the documented purpose and applicable obligations, not chosen for convenience.

| Data category | Purpose and owner | Approved retention trigger/period | Deletion method | Verification |
|---|---|---|---|---|
| User accounts and OIDC identifiers | `[complete]` | `[approve]` | `[complete]` | `[complete]` |
| Sessions and login transactions | Authentication and abuse prevention | Set a short expiry consistent with the authentication design; confirm implementation | Expiry cleanup and revocation | Automated expiry/revocation test |
| Cases and investigation history | `[complete]` | `[approve]` | `[complete]` | `[complete]` |
| Evidence and source references | `[complete]` | `[approve]` | `[complete]` | `[complete]` |
| Versioned reports and exports | `[complete]` | `[approve]` | `[complete]` | `[complete]` |
| Security/audit events | Accountability and incident response | `[approve, including access limits]` | `[complete]` | `[complete]` |
| Application, proxy, and error logs | Operations and security | `[approve; redact personal data]` | `[complete]` | `[complete]` |
| Backups and snapshots | Recovery | `[approve maximum lifetime]` | Expiry plus controlled deletion where required | Restore and expiry drill |
| Provider-held data and caches | `[identify every provider]` | `[confirm provider terms]` | Provider-specific deletion/expiry | Evidence or documented limitation |

## Deletion lifecycle

For each category, document and test the full lifecycle:

1. **Request and authorization:** authenticate the requester, verify ownership/authority, record the request, and avoid disclosing whether another user's records exist.
2. **Pending state:** block ordinary access promptly where the current application behavior supports it. Pending deletion is not physical deletion.
3. **Primary data:** delete the case, evidence, report snapshots, identifiers, and dependent records according to the approved schedule and integrity constraints.
4. **Derived data:** include search indexes, caches, exports, analytics, and any generated artifacts that contain or identify the deleted records.
5. **Backups:** document expiry and restoration behavior. If a backup is restored, re-apply deletion records before restored data becomes accessible. State any technically or legally justified exception.
6. **Provider copies:** follow each provider's contractual deletion process; do not claim deletion from a third party without evidence.
7. **Audit trail:** retain only the minimum event needed to demonstrate completion, under its separately approved retention period. Do not retain the deleted content inside the audit event.
8. **Confirmation:** communicate completion or a specific limitation to the requester without revealing sensitive internal details.

Define a process for legal holds and documented exceptions. A hold must identify the authority, scope, approver, review date, and release procedure; it must not become indefinite by default.

## Implementation requirements

- [ ] Approve and version the schedule above before production data is accepted.
- [ ] Map each data category to database tables, logs, provider systems, exports, and backup locations.
- [ ] Implement scheduled enforcement only after the policy is approved.
- [ ] Make purge jobs idempotent, bounded, least-privileged, observable, and safe to retry.
- [ ] Emit minimized audit events for requests, approvals, execution, failures, and completion.
- [ ] Restrict access to pending-deletion data and purge tooling.
- [ ] Test deletion across foreign-key dependencies, derived records, and account/case boundaries.
- [ ] Test backup expiry and restore-time reapplication of deletion requests.
- [ ] Verify provider retention and deletion terms and document unsupported deletion guarantees.
- [ ] Test that logs and audit events do not preserve the content intended for deletion.
- [ ] Define escalation for failed or partially completed deletion jobs.
- [ ] Review access, correction, dispute, and appeal workflows alongside deletion.

## Review evidence

For each release, record the policy version, test results, exceptions, outstanding gaps, responsible owner, and approval date. If a deletion guarantee cannot be verified, describe the limitation plainly; do not describe a pending flag or primary-row purge as complete erasure.
