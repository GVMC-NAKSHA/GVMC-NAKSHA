-- worker/src/harmonize/match_ward.sql
WITH pairs AS (
  SELECT a.id AS a_id, b.id AS b_id, da.type AS a_type, db.type AS b_type,
         CASE WHEN ST_Dimension(a.geom) = 2 AND ST_Dimension(b.geom) = 2
              THEN ST_Area(ST_Intersection(a.geom, b.geom))
                   / NULLIF(ST_Area(ST_Union(a.geom, b.geom)), 0)
         END AS iou,
         CASE WHEN ST_Dimension(a.geom) = 0 OR ST_Dimension(b.geom) = 0
              THEN ST_Distance(a.geom::geography, ST_Centroid(b.geom)::geography)
         END AS dist_m
  FROM source_features a
  JOIN data_sources   da ON da.id = a.source_id
  JOIN source_features b  ON b.id > a.id
       AND ST_DWithin(a.geom::geography, b.geom::geography, 50)   -- GiST-indexed prune
  JOIN data_sources   db ON db.id = b.source_id
  WHERE da.ward_id = %(ward)s AND db.ward_id = %(ward)s AND da.type <> db.type
)
SELECT *, round(100 * COALESCE(iou, GREATEST(0, 1 - dist_m / 25.0)), 2) AS match_score
FROM pairs
WHERE COALESCE(iou, 0) >= 0.30 OR COALESCE(dist_m, 999) <= 25;
