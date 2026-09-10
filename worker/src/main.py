import json, os, time, traceback
import redis
from ingest.adapters import normalize_source
from ocr.digitize import digitize
from harmonize.match import match_ward
from harmonize.conflicts import detect_conflicts
from harmonize.schema_map import run_schema_map

HANDLERS = {
    "NORMALIZE_SOURCE": normalize_source,
    "DIGITIZE_SOURCE":  digitize,
    "SCHEMA_MAP":       run_schema_map,
    "HARMONIZE_WARD":   match_ward,
    "DETECT_CONFLICTS": detect_conflicts,
}

r = redis.from_url(os.environ["REDIS_URL"])
QUEUE, DEAD = "queue:ingest", "queue:ingest:dead"

def run():
    print("[worker] up, waiting on", QUEUE)
    while True:
        item = r.brpop(QUEUE, timeout=5)
        if not item:
            continue
        job = json.loads(item[1])
        handler = HANDLERS.get(job.get("jobType"))
        if not handler:
            print("[worker] unknown jobType", job.get("jobType")); continue
        try:
            handler(job)
            print("[worker] done", job["jobType"], job.get("jobId"))
        except Exception as e:                                   # noqa: BLE001
            traceback.print_exc()
            job["error"], job["attempts"] = str(e), job.get("attempts", 0) + 1
            (r.lpush(QUEUE, json.dumps(job)) if job["attempts"] < 3
             else r.lpush(DEAD, json.dumps(job)))

if __name__ == "__main__":
    run()
