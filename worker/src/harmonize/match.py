import json
import redis, os
from db import cursor

_r = redis.from_url(os.environ["REDIS_URL"])

MATCH_SQL = open(os.path.join(os.path.dirname(__file__), "match_ward.sql")).read()  # the WITH pairs ... query

SOURCE_RELIABILITY = {
    "gnss_cors": 1.0, "cadastral": 0.95, "ground_truth": 0.9, "building_footprint": 0.8,
    "municipal_gis": 0.8, "utility": 0.75, "ori": 0.7, "dsm_dtm": 0.7, "revenue": 0.65, "drone_imagery": 0.6,
}

def _confidence(match_score, a_type, b_type, captured_at):
    geometric  = match_score / 100
    attribute  = 0.5                                        # refined once schema_mappings exist
    reliability = (SOURCE_RELIABILITY[a_type] + SOURCE_RELIABILITY[b_type]) / 2
    recency    = 1.0                                        # decay applied when captured_at known
    score = round(100 * (0.4*geometric + 0.3*attribute + 0.2*reliability + 0.1*recency))
    return score, {"geometric_match_score": round(geometric, 4),
                   "attribute_match_score": round(attribute, 4),
                   "source_reliability_weight": round(reliability, 4),
                   "recency_score": round(recency, 4)}

def match_ward(job):
    ward = job["wardId"]
    with cursor() as cur:
        cur.execute(MATCH_SQL, {"ward": ward})
        pairs = cur.fetchall()
        for p in pairs:
            score, breakdown = _confidence(float(p["match_score"]), p["a_type"], p["b_type"], None)
            cur.execute(
                """INSERT INTO matches (ward_id, feature_a_id, feature_b_id, source_a_type, source_b_type,
                                        geometry_iou, centroid_distance_m, match_score, confidence_breakdown)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (feature_a_id, feature_b_id) DO UPDATE SET
                       match_score = EXCLUDED.match_score,
                       confidence_breakdown = EXCLUDED.confidence_breakdown,
                       matched_at = now()""",
                (ward, p["a_id"], p["b_id"], p["a_type"], p["b_type"],
                 p["iou"], p["dist_m"], p["match_score"], json.dumps(breakdown)))
    _r.lpush("queue:ingest", json.dumps({"jobType": "DETECT_CONFLICTS", "wardId": ward}))
    print(f"[match] ward {ward}: {len(pairs)} matches")
