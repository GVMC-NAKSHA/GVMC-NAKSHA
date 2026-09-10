CREATE TABLE data_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         source_type   NOT NULL,
  ward_id      text REFERENCES wards(id),
  r2_key       text NOT NULL,                          -- sources/<type>/<uuid>.<ext>
  original_name text,
  crs          text,                                   -- e.g. 'EPSG:32644'
  captured_at  timestamptz,
  scanned      boolean NOT NULL DEFAULT false,
  status       source_status NOT NULL DEFAULT 'processing',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- OCR fields, band info, feature count...
  error        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_sources_type_ward_idx ON data_sources (type, ward_id, status);

CREATE TABLE source_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  geom        geometry(Geometry, 4326) NOT NULL,       -- Point | Polygon | LineString | Multi*
  properties  jsonb NOT NULL DEFAULT '{}'::jsonb,
  was_invalid boolean NOT NULL DEFAULT false,          -- B.4 flagged + fixed this geometry
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_features_geom_idx   ON source_features USING GIST (geom);
CREATE INDEX source_features_source_idx ON source_features (source_id);

-- deferred FK from 0003
ALTER TABLE tickets
  ADD CONSTRAINT tickets_parcel_fk FOREIGN KEY (parcel_id) REFERENCES source_features(id);

-- optional structured store for OCR output (also mirrored into data_sources.metadata)
CREATE TABLE ocr_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  field       text NOT NULL,                           -- 'khata_no', 'owner_name', ...
  value       text,
  confidence  numeric(5,2),                            -- 0-100 (mean word confidence)
  page        int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ocr_results_source_idx ON ocr_results (source_id);
