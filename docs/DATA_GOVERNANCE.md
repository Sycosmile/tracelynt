# Data Governance and Privacy

This is an engineering policy draft, not legal advice. Before launch, assess applicable laws and obligations in each operating jurisdiction, including Nigerian data-protection requirements where relevant, provider terms, and cross-border processing.

## Purpose limitation

Process information only for a defined, legitimate research, fraud-prevention, security, or due-diligence purpose. Public accessibility alone does not make collection, combination, retention, or republication lawful or appropriate.

For every field, document purpose, provenance, collection permissions, access, retention, and whether a less sensitive alternative exists. Prefer concise observations and source links over copying entire pages or provider payloads.

## Source categories

- Public technical metadata: DNS, TLS certificate details, and bounded technical observations.
- Public business information: official websites, registries, and reputable directories, subject to terms and law.
- Provider-supplied metadata: reviewed provider, permissions, terms, and retention.
- User-submitted reports: unverified statements requiring abuse controls and clear labels.
- Analyst assessment: interpretation distinct from source facts.

Record source identity, canonical URL or provider reference, retrieval time, and limitations. Mark findings when the source cannot be reproduced or reviewed.

## Phone-number data

Numbers can be reassigned, spoofed, shared, or used by someone other than a registered subscriber. Number region, carrier, line type, messaging activity, and user control do not establish legal identity, address, current location, or original ownership.

Appropriate behavior may include syntax validation, numbering-plan region, and provider-backed carrier/line-type metadata with source and timestamp. OTP can verify current access to a channel, not legal identity or original ownership.

Do not seek or expose protected subscriber records, call details, SMS content, or live location without separately reviewed lawful authorization and purpose.

## Accuracy, disputes, and fairness

- Label allegations as unverified until corroborated.
- Avoid definitive accusations based on user reports or weak signals.
- Display conflicting evidence and explain uncertainty.
- Provide correction, dispute, and review routes.
- Preserve only a limited correction audit trail where appropriate.
- Do not make automated high-impact eligibility decisions.
- Do not resolve identity based on one shared attribute.

## Retention and deletion

Define explicit retention periods before production. Do not retain all searches indefinitely by default. Cover search/provider metadata, cases, evidence, notes, reports, audit logs, abuse reports, cached responses, backups, and exported files.

Deletion should propagate to derived records and caches where feasible. Document any legal/security retention exception, restrict access, and set a review date.

## Access, sharing, and exports

- Cases are private by default; require explicit authorization to share.
- Show who can access shared cases.
- Audit sensitive access and report exports.
- Include report scope, sources, timestamps, generation time, and limitations.
- Never expose private-person reports through guessable URLs.
- Use access-controlled, expiring links for stored exports.

## Provider review

Before adding a source, document provider identity, legal/contractual permissions, returned fields, accuracy and freshness, retention and deletion, security/authentication, cost and quotas, outage behavior, and misuse risk. Reject sources with unclear provenance or apparent reliance on unauthorized private-record dumps.

## Incident handling

For suspected incidents, contain the issue, restrict access, preserve necessary incident evidence, assess impact, and make notification decisions under applicable obligations. Assign an owner and escalation path before production.