import os, json
from contextlib import contextmanager
import psycopg2, psycopg2.extras

@contextmanager
def cursor():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with conn, conn.cursor() as cur:
            yield cur
    finally:
        conn.close()

def get_data_source(source_id):
    with cursor() as cur:
        cur.execute("SELECT * FROM data_sources WHERE id = %s", (source_id,))
        return cur.fetchone()

def insert_source_feature(source_id, geom_geojson, properties, was_invalid):
    with cursor() as cur:
        cur.execute(
            """INSERT INTO source_features (source_id, geom, properties, was_invalid)
               VALUES (%s, ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s, %s)""",
            (source_id, json.dumps(geom_geojson), json.dumps(properties), was_invalid))

def set_status(source_id, status, error=None):
    with cursor() as cur:
        cur.execute("UPDATE data_sources SET status=%s, error=%s WHERE id=%s", (status, error, source_id))

def update_source_metadata(source_id, patch: dict):
    with cursor() as cur:
        cur.execute("UPDATE data_sources SET metadata = metadata || %s::jsonb WHERE id=%s",
                    (json.dumps(patch), source_id))
