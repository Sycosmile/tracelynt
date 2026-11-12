-- Bound shared rate-limit storage even when clients present many distinct source keys.
-- New keys are serialized under one transaction-scoped advisory lock. Existing
-- buckets take only their row lock, so normal repeat traffic does not serialize globally.
CREATE OR REPLACE FUNCTION enforce_rate_limit_bucket_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  existing_hash bytea;
  bucket_count bigint;
  bucket_limit integer;
BEGIN
  SELECT key_hash
    INTO existing_hash
    FROM rate_limit_buckets
   WHERE key_hash = NEW.key_hash
   FOR UPDATE;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Serialize only first-seen keys; the lock is held until this insert commits.
  PERFORM pg_advisory_xact_lock(1414676803, 1162621262);

  -- Recheck after acquiring the lock because another request may have inserted
  -- this key while we were waiting.
  SELECT key_hash
    INTO existing_hash
    FROM rate_limit_buckets
   WHERE key_hash = NEW.key_hash
   FOR UPDATE;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- The table is capped, so draining expired rows here has a fixed upper bound.
  DELETE FROM rate_limit_buckets
   WHERE expires_at <= clock_timestamp();

  bucket_limit := COALESCE(
    NULLIF(current_setting('tracelynt.rate_limit_bucket_limit', true), ''),
    '20000'
  )::integer;

  IF bucket_limit < 1 OR bucket_limit > 20000 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_BUCKET_CAPACITY'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
    INTO bucket_count
    FROM rate_limit_buckets;

  IF bucket_count >= bucket_limit THEN
    RAISE EXCEPTION 'RATE_LIMIT_BUCKET_CAPACITY_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rate_limit_bucket_capacity_guard
BEFORE INSERT ON rate_limit_buckets
FOR EACH ROW
EXECUTE FUNCTION enforce_rate_limit_bucket_capacity();

COMMENT ON FUNCTION enforce_rate_limit_bucket_capacity() IS
  'Caps shared rate-limit storage at 20000 active buckets and removes expired rows before admitting new keys.';
