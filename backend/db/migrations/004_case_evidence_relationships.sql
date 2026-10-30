-- Typed, case-scoped evidence relationships. Composite foreign keys prevent
-- linking evidence across cases even if an application query is incorrect.
CREATE UNIQUE INDEX evidence_items_case_id_id_uq ON evidence_items (case_id, id);

CREATE TABLE case_evidence_relationships (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_evidence_id uuid NOT NULL,
  target_evidence_id uuid NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'supports', 'contradicts', 'corroborates', 'derived_from', 'same_subject', 'related_to'
  )),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_evidence_id <> target_evidence_id),
  UNIQUE (case_id, source_evidence_id, target_evidence_id, relationship_type),
  FOREIGN KEY (case_id, source_evidence_id)
    REFERENCES evidence_items (case_id, id) ON DELETE CASCADE,
  FOREIGN KEY (case_id, target_evidence_id)
    REFERENCES evidence_items (case_id, id) ON DELETE CASCADE
);

CREATE INDEX case_evidence_relationships_case_idx
  ON case_evidence_relationships (case_id, created_at, id);
