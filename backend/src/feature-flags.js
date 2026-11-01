// Domain inspection is opt-in and requires an explicit deployment security attestation.
// The attestation must only be set after the deployed egress boundary is independently verified.
export function isDomainInspectionEnabled(env = process.env) {
  return env.DOMAIN_INSPECTION_ENABLED === 'true' &&
    env.DOMAIN_INSPECTION_EGRESS_VERIFIED === 'true';
}
