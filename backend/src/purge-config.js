export function getPurgeConfig(env = process.env) {
  const rawDryRun = env.PURGE_DRY_RUN;
  let dryRun = true;

  if (rawDryRun !== undefined && rawDryRun !== '') {
    if (rawDryRun !== 'true' && rawDryRun !== 'false') {
      throw new Error('PURGE_DRY_RUN must be exactly true or false.');
    }
    dryRun = rawDryRun === 'true';
  }

  if (!dryRun && env.CONFIRM_PURGE_PENDING_CASES !== 'YES') {
    throw new Error('Refusing destructive purge. Set CONFIRM_PURGE_PENDING_CASES=YES after reviewing the approved retention policy.');
  }

  return { dryRun };
}
