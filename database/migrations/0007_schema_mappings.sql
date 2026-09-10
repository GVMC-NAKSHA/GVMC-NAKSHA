CREATE TABLE schema_mappings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_a_id  uuid REFERENCES data_sources(id) ON DELETE CASCADE,
  source_b_id  uuid REFERENCES data_sources(id) ON DELETE CASCADE,
  field_a      text NOT NULL,
  field_b      text NOT NULL,
  confidence   numeric(4,3) NOT NULL,                  -- 0-1 from the LLM
  rationale    text,
  approved     boolean,                                -- analyst override (null = unreviewed)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schema_mappings_pair_idx ON schema_mappings (source_a_id, source_b_id);
