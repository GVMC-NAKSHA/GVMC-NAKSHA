CREATE TABLE drone_tiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id      text REFERENCES wards(id),
  source_id    uuid REFERENCES data_sources(id),
  bbox         geometry(Polygon, 4326) NOT NULL,
  confidence   numeric(5,2) NOT NULL,                  -- on-device model score
  r2_key       text NOT NULL,
  captured_at  timestamptz,
  buffered     boolean NOT NULL DEFAULT false,         -- low-confidence, held on device
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drone_tiles_bbox_idx ON drone_tiles USING GIST (bbox);
