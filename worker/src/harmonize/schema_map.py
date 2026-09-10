import os, json
from groq import Groq
from db import cursor

_groq = Groq(api_key=os.environ["GROQ_API_KEY"])

def run_schema_map(job):
    a_id, b_id = job["sourceAId"], job["sourceBId"]
    with cursor() as cur:
        cur.execute("SELECT metadata FROM data_sources WHERE id = %s", (a_id,))
        a_meta = cur.fetchone()["metadata"]
        cur.execute("SELECT metadata FROM data_sources WHERE id = %s", (b_id,))
        b_meta = cur.fetchone()["metadata"]

    prompt = (
        "You are a data-integration assistant for the NAKSHA land-records programme.\n"
        "Given two datasets' fields, propose field-to-field mappings as a JSON array of "
        '{"field_a","field_b","confidence"(0-1),"rationale"}.\n'
        f"Dataset A fields: {list((a_meta.get('ocr') or a_meta).keys())}\n"
        f"Dataset B fields: {list((b_meta.get('ocr') or b_meta).keys())}\n"
        "Return JSON only.")
    raw = _groq.chat.completions.create(
        model="llama-3.3-70b-versatile", temperature=0.2, max_tokens=700,
        messages=[{"role": "user", "content": prompt}]).choices[0].message.content
    mappings = json.loads(raw[raw.index("["): raw.rindex("]") + 1])

    with cursor() as cur:
        for m in mappings:
            cur.execute("""INSERT INTO schema_mappings
                           (source_a_id, source_b_id, field_a, field_b, confidence, rationale)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (a_id, b_id, m["field_a"], m["field_b"], m["confidence"], m.get("rationale")))
