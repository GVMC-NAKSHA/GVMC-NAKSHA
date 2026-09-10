CREATE TABLE tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id          text NOT NULL REFERENCES wards(id),
  property_id      uuid REFERENCES properties(id),
  parcel_id        uuid,                                   -- NEW: GT ↔ cadastral link.
                                                           -- FK -> source_features(id) is added by the
                                                           -- deferred ALTER at the end of 0005 (source_features
                                                           -- does not exist yet at 0003). Keep it nullable.
  house_number     text NOT NULL,
  description      text NOT NULL,
  tax_pending      numeric(12,2),
  gnss_lat         numeric(10,7),                          -- NEW: field GNSS capture
  gnss_lng         numeric(10,7),
  gnss_accuracy_m  numeric(6,2),                            -- NEW
  photo_r2_key     text,
  status           ticket_status NOT NULL DEFAULT 'open',
  supervisor_notes text,
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_ward_idx   ON tickets (ward_id);
CREATE INDEX tickets_status_idx ON tickets (status);
