CREATE TABLE conflicts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  match_id             uuid REFERENCES matches(id) ON DELETE CASCADE,
  conflict_type        conflict_type   NOT NULL,
  severity             conflict_sev    NOT NULL,
  detail               jsonb NOT NULL DEFAULT '{}'::jsonb,   -- which attrs disagree, deltas
  suggested_resolution text,
  status               conflict_status NOT NULL DEFAULT 'pending',
  resolved_by          text,
  resolved_at          timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conflicts_ward_status_idx ON conflicts (ward_id, status, severity);
