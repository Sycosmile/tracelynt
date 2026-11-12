// Domain inspection is opt-in and requires an explicit deployment security attestation.
// Render does not provide a general per-service outbound destination firewall, so this
// sensitive feature stays disabled there even if deployment flags are accidentally enabled.
export function isDomainInspectionEnabled(env = process.env) {
  if (env.RENDER === 'true') return false;
  return env.DOMAIN_INSPECTION_ENABLED === 'true' &&
    env.DOMAIN_INSPECTION_EGRESS_VERIFIED === 'true';
}
