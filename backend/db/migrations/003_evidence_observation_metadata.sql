-- Add structured observation metadata without rewriting existing evidence.
-- Existing rows intentionally remain unknown where the source data is unavailable.
ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS freshness_as_of timestamptz,
  ADD COLUMN IF NOT EXISTS provenance_kind text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS provenance_actor_id text,
  ADD COLUMN IF NOT EXISTS source_provider_id text;

ALTER TABLE evidence_items
  ADD CONSTRAINT evidence_freshness_state_check
    CHECK (freshness_state IN ('current', 'stale', 'unknown', 'not_applicable')),
  ADD CONSTRAINT evidence_provenance_kind_check
    CHECK (provenance_kind IN ('provider', 'analyst', 'system', 'user')),
  ADD CONSTRAINT evidence_provenance_actor_id_check
    CHECK (provenance_actor_id IS NULL OR length(provenance_actor_id) <= 100),
  ADD CONSTRAINT evidence_source_provider_id_check
    CHECK (source_provider_id IS NULL OR length(source_provider_id) <= 100);

COMMENT ON COLUMN evidence_items.source_published_at IS
  'Source publication time, distinct from observed_at and retrieval/creation time.';
COMMENT ON COLUMN evidence_items.freshness_state IS
  'Analyst/provider freshness assessment; unknown is not equivalent to current.';
COMMENT ON COLUMN evidence_items.freshness_as_of IS
  'Timestamp at which the freshness assessment applies.';
COMMENT ON COLUMN evidence_items.provenance_kind IS
  'Origin class for the evidence: provider, analyst, system, or user.';
