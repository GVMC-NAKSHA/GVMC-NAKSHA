INSERT INTO properties
  (ward_id, lat, lng, area_sqm, detection_type, confidence, confidence_breakdown, detected_at, status)
SELECT w, lat, lng, area, dtype::detection_type, conf,
       jsonb_build_object('ndbi_delta', ndbi, 'area_delta', adelta, 'ndvi_drop', ndvi,
                          'osm_status', osm, 'db_match', dbm),
       now() - (rn || ' days')::interval, st::property_status
FROM (VALUES
  ('1',17.7305,83.3005,142.5,'new_build',   0.91,0.34,120.0,0.22,'absent',false,'pending',1),
  ('1',17.7288,83.2971,88.0, 'change_of_use',0.63,0.16, 40.0,0.05,'present',true, 'pending',2),
  ('1',17.7331,83.3040,210.0,'new_build',   0.88,0.29,180.0,0.19,'absent',false,'underassessed',3),
  ('1',17.7269,83.2955,64.0, 'new_build',   0.55,0.12, 55.0,0.03,'absent',false,'pending',4),
  ('1',17.7350,83.3062,320.0,'new_build',   0.94,0.41,300.0,0.27,'absent',false,'verified',5),
  ('2',17.7602,83.2612,175.0,'new_build',   0.86,0.28,150.0,0.18,'absent',false,'pending',2),
  ('2',17.7635,83.2650,95.0, 'change_of_use',0.71,0.19, 48.0,0.08,'present',true, 'pending',3),
  ('2',17.7580,83.2588,58.0, 'new_build',   0.49,0.10, 45.0,0.02,'absent',false,'false_positive',6),
  ('2',17.7660,83.2668,240.0,'new_build',   0.90,0.33,220.0,0.24,'absent',false,'underassessed',4),
  ('2',17.7555,83.2560,130.0,'new_build',   0.78,0.24,110.0,0.14,'absent',false,'pending',5),
  ('3',17.7150,83.2860,160.0,'new_build',   0.83,0.27,140.0,0.17,'absent',false,'pending',1),
  ('3',17.7128,83.2835,72.0, 'change_of_use',0.60,0.15, 35.0,0.04,'present',true, 'pending',7),
  ('3',17.7175,83.2888,290.0,'new_build',   0.92,0.38,270.0,0.25,'absent',false,'verified',8),
  ('3',17.7100,83.2810,50.0, 'new_build',   0.44,0.09, 40.0,0.01,'absent',false,'pending',9),
  ('3',17.7190,83.2905,205.0,'new_build',   0.87,0.30,185.0,0.20,'absent',false,'underassessed',2),
  ('4',17.7005,83.2160,185.0,'new_build',   0.89,0.31,165.0,0.21,'absent',false,'pending',1),
  ('4',17.6988,83.2135,110.0,'change_of_use',0.68,0.17, 52.0,0.07,'present',true, 'pending',3),
  ('4',17.7028,83.2190,340.0,'new_build',   0.95,0.44,320.0,0.29,'absent',false,'pending',2),
  ('4',17.6960,83.2110,66.0, 'new_build',   0.52,0.11, 50.0,0.02,'absent',false,'already_assessed',10),
  ('4',17.7040,83.2205,150.0,'new_build',   0.80,0.25,130.0,0.15,'absent',false,'verified',6),
  ('5',17.6805,83.2050,170.0,'new_build',   0.85,0.28,150.0,0.18,'absent',false,'pending',1),
  ('5',17.6788,83.2025,90.0, 'change_of_use',0.66,0.16, 44.0,0.06,'present',true, 'pending',4),
  ('5',17.6828,83.2080,260.0,'new_build',   0.91,0.36,240.0,0.24,'absent',false,'underassessed',3),
  ('5',17.6760,83.2000,54.0, 'new_build',   0.47,0.10, 42.0,0.02,'absent',false,'pending',8),
  ('5',17.6840,83.2095,200.0,'new_build',   0.88,0.31,180.0,0.20,'absent',false,'pending',2)
) AS t(w, lat, lng, area, dtype, conf, ndbi, adelta, ndvi, osm, dbm, st, rn);
