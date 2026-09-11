-- B.10 — the canonical harmonized cadastre output (golden record + export).
-- One row per matched cluster: geom copied from the highest-reliability member source;
-- `attributes` merged field-by-field via `schema_mappings`; `attribute_provenance` records
-- which source_type each field came from.

CREATE TABLE harmonized_parcels (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id              text REFERENCES wards(id),
  geom                 geometry(MultiPolygon, 4326) NOT NULL,
  geom_source_id       uuid REFERENCES data_sources(id),
  geom_source_type     source_type,
  attributes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribute_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { field: source_type }
  member_feature_ids   uuid[]  NOT NULL DEFAULT '{}',
  match_ids            uuid[]  NOT NULL DEFAULT '{}',
  confidence           numeric(5,4),                         -- mean of member matches' score
  conflict_count       int     NOT NULL DEFAULT 0,           -- unresolved conflicts on the cluster
  assembled_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX harmonized_parcels_geom_idx ON harmonized_parcels USING GIST (geom);
CREATE INDEX harmonized_parcels_ward_idx ON harmonized_parcels (ward_id, confidence DESC);

-- Completed cadastre export files (GeoJSON built by the API, GeoPackage by the worker).
CREATE TABLE harmonized_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id       text REFERENCES wards(id),
  format        text NOT NULL CHECK (format IN ('geojson','gpkg')),
  r2_key        text,
  feature_count int,
  status        text NOT NULL DEFAULT 'ready' CHECK (status IN ('processing','ready','failed')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX harmonized_exports_ward_idx ON harmonized_exports (ward_id, created_at DESC);
