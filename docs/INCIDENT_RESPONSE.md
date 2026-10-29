# Incident Response Runbook

## Status and scope

This runbook is a planning baseline for the Tracelynt prototype, not evidence that production incident response is operational. The project is not approved for real personal or investigation data. Before deployment, assign an incident owner and backup, establish a private reporting channel, and adapt this document to the hosting provider and applicable legal obligations.

## Severity guide

- **SEV 1 — active compromise or material exposure:** confirmed unauthorized access to private cases, session/authentication compromise, exposed production secrets, or ongoing access to sensitive data.
- **SEV 2 — credible security weakness or service abuse:** suspected cross-account access, sustained enumeration, SSRF/control bypass, or provider-key misuse without confirmed material exposure.
- **SEV 3 — contained defect:** isolated security-relevant bug with no evidence of exploitation or exposure.

When uncertain, start at the higher severity and downgrade only after evidence supports it.

## First 30 minutes

1. Record the discovery time in UTC, reporter, affected service/environment, observed symptoms, and how the issue was detected.
2. Open a private incident record. Do not post tokens, personal records, exploitable details, or customer data in public issues or chat.
3. Assign an incident lead and a technical responder. Keep a timestamped action log and distinguish confirmed facts from hypotheses.
4. Preserve relevant logs, deployment identifiers, workflow runs, and database audit records before rotation or cleanup changes the evidence.
5. Assess whether the issue is ongoing, which accounts/data/services may be affected, and whether immediate containment is required.

## Containment

Choose the least destructive action that stops ongoing harm, and record who approved it and when.

- Revoke or rotate exposed credentials and provider keys; remove the secret from active configuration and inspect access logs for use.
- If sessions may be compromised, disable affected access and revoke active sessions using the supported operator procedure.
- Disable the affected route, integration, or deployment if exploitation is ongoing and a safe targeted mitigation is unavailable.
- Apply temporary rate limits or block abusive traffic without treating IP address alone as proof of identity.
- Avoid destructive database cleanup until relevant evidence is preserved. Do not run the pending-record purge as an incident shortcut.

## Investigation and impact assessment

- Establish a UTC timeline using source timestamps and preserve original log context.
- Identify affected code versions, endpoints, accounts, case/evidence/report IDs, secrets, and provider quotas.
- Check whether authorization, authentication, CSRF, SSRF, audit logging, or deletion controls were bypassed.
- Record the scope and confidence of each finding. If scope is unknown, state that explicitly rather than asserting no exposure.
- Minimize copying personal data into the incident record; retain only what is necessary for response and legal review.

## Recovery

1. Patch the root cause on a separate branch and add a regression test where feasible.
2. Review the complete diff and run syntax/unit tests, PostgreSQL integration tests, dependency/secret checks, and CodeQL as applicable.
3. Verify the fix against the original reproduction and check for related paths.
4. Restore service only after the incident lead approves the mitigation and monitoring plan.
5. Rotate credentials again if the fix or investigation could have exposed replacement secrets.
6. Monitor for recurrence and document residual risks.

## Communication and escalation

- Notify the project owner and affected service/provider contacts through private channels.
- Before notifying affected people, regulators, or other parties, assess applicable law, contracts, and advice from qualified counsel. Record the decision and deadlines; do not delay urgent protective action while waiting for a complete root-cause analysis.
- Publicly disclose only after coordinated review, with no secrets, personal records, or unnecessary exploit details.
- If a vulnerability affects a third-party provider, follow that provider's security reporting policy.

## Closure and follow-up

The incident lead should document: impact and affected period; confirmed facts versus unknowns; root cause; containment and recovery actions; evidence locations and access controls; notifications and rationale; regression tests; remaining risks; and named owners/due dates for corrective actions.

Run a blameless review within five business days of containment. Update the threat model, security checklist, monitoring, and this runbook. Do not claim an incident is fully resolved until follow-up actions have owners and verification criteria.

## Readiness checklist before production

- [ ] Named incident lead and backup with contact details.
- [ ] Private reporting channel and escalation tree tested.
- [ ] Log retention, access control, redaction, and UTC timestamping configured.
- [ ] Credential and session revocation procedures rehearsed.
- [ ] Backup restoration and evidence preservation procedures tested.
- [ ] Legal/privacy notification decision process reviewed for target jurisdictions.
- [ ] Tabletop exercise completed and actions tracked.
