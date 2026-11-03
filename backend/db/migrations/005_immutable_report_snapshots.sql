-- Report snapshots are immutable once created. The deletion marker is
-- lifecycle metadata and may be set once, but cannot be cleared.
CREATE FUNCTION prevent_report_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.creator_user_id IS DISTINCT FROM OLD.creator_user_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
    OR NEW.report_data IS DISTINCT FROM OLD.report_data THEN
    RAISE EXCEPTION 'Report snapshots are immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'A report snapshot deletion marker cannot be changed or cleared.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER report_versions_immutable
BEFORE UPDATE ON report_versions
FOR EACH ROW
EXECUTE FUNCTION prevent_report_snapshot_mutation();
