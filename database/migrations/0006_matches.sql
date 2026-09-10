CREATE TABLE matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id             text REFERENCES wards(id),
  feature_a_id        uuid NOT NULL REFERENCES source_features(id) ON DELETE CASCADE,
  feature_b_id        uuid NOT NULL REFERENCES source_features(id) ON DELETE CASCADE,
  source_a_type       source_type NOT NULL,
  source_b_type       source_type NOT NULL,
  geometry_iou        numeric(5,4),
  centroid_distance_m numeric(8,2),
  match_score         numeric(5,2) NOT NULL,           -- 0-100
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,  -- B.7 (4 terms)
  matched_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feature_a_id, feature_b_id)
);
CREATE INDEX matches_ward_score_idx ON matches (ward_id, match_score DESC);
