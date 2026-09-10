CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()

-- enums
CREATE TYPE detection_type   AS ENUM ('new_build','change_of_use');
CREATE TYPE property_status  AS ENUM ('pending','verified','underassessed','false_positive','already_assessed');
CREATE TYPE alert_severity   AS ENUM ('danger','warning','info');
CREATE TYPE ticket_status    AS ENUM ('open','under_review','resolved');
CREATE TYPE user_role        AS ENUM ('admin','official','analyst','citizen');

CREATE TYPE source_type AS ENUM (
  'drone_imagery','ori','dsm_dtm','cadastral','revenue',
  'municipal_gis','utility','ground_truth','gnss_cors','building_footprint'
);
CREATE TYPE source_status    AS ENUM ('processing','pending_ocr','ready','failed');
CREATE TYPE conflict_type    AS ENUM ('geometry_mismatch','attribute_mismatch','both');
CREATE TYPE conflict_sev     AS ENUM ('low','medium','high','critical');
CREATE TYPE conflict_status  AS ENUM ('pending','resolved','needs_review','rejected');
