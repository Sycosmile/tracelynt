# Frontend

The frontend has not been implemented yet.

## Responsibilities
- Accept and validate input for usability; backend validation remains authoritative.
- Display findings with source, retrieval time, verification state, and limitations.
- Separate provider data, public records, user reports, and analyst assessment.
- Show case access and sharing state.
- Provide accessible loading, partial-result, empty, and error states.
- Offer correction and dispute flows when implemented.

## Security requirements
- Never embed provider secrets in client bundles.
- Do not render source HTML as trusted application markup.
- Treat external URLs as untrusted and display their destinations clearly.
- Do not rely on hidden UI controls for authorization.
- Avoid storing sensitive investigation data in local storage by default.
- Keep personal data and secrets out of analytics events.
- Use secure session handling and protect state-changing requests as required by the chosen authentication design.

## Initial screens
1. Search form for supported query types.
2. Results view with source attribution and caveats.
3. Private case workspace in a later phase.
4. Report preview and controlled export in a later phase.

Select the framework and package manager before adding code. Document setup and tests once implementation exists.