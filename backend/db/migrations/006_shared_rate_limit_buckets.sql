-- Shared fixed-window rate-limit buckets for multi-process deployments.
-- Only SHA-256 key hashes are stored; raw IPs and user identifiers are not persisted.
CREATE TABLE rate_limit_buckets (
  key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > window_started_at)
);

CREATE INDEX rate_limit_buckets_expiry_idx
  ON rate_limit_buckets (expires_at);
