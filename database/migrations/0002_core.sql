CREATE TABLE wards (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  bbox_north  numeric(10,6),
  bbox_south  numeric(10,6),
  bbox_east   numeric(10,6),
  bbox_west   numeric(10,6),
  geojson_r2  text,                                   -- R2 key (was geojson_s3)
  boundary    geometry(MultiPolygon, 4326)           -- NEW: real geometry
);
CREATE INDEX wards_boundary_idx ON wards USING GIST (boundary);

CREATE TABLE properties (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  lat                  numeric(10,7),
  lng                  numeric(10,7),
  geom                 geometry(Point, 4326)          -- NEW: derived from lat/lng
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
  area_sqm             numeric(12,2),
  detection_type       detection_type,
  confidence           numeric(5,4),
  confidence_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at          timestamptz,
  geojson_r2           text,                          -- was s3_geojson_key
  status               property_status NOT NULL DEFAULT 'pending',
  notes                text,
  updated_by           text,
  updated_at           timestamptz,
  ai_explanation       text
);
CREATE INDEX properties_ward_idx  ON properties (ward_id, status);
CREATE INDEX properties_geom_idx  ON properties USING GIST (geom);

CREATE TABLE verification_status (
  property_id uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  status      property_status NOT NULL,
  updated_by  text,
  updated_at  timestamptz,
  notes       text
);

CREATE TABLE admin_config (
  key_name   text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id    text REFERENCES wards(id),
  severity   alert_severity NOT NULL,
  text       text NOT NULL,
  score      int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_ward_idx ON alerts (ward_id, created_at DESC);
