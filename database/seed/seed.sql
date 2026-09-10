INSERT INTO admin_config (key_name, value) VALUES
  ('data_mode','demo'), ('pipeline_status','idle'),
  ('last_refresh','2026-07-30T04:00:00.000Z'), ('ndbi_threshold','0.15')
ON CONFLICT (key_name) DO NOTHING;

INSERT INTO wards (id, name, bbox_north, bbox_south, bbox_east, bbox_west, geojson_r2) VALUES
  ('1','Seethammadhara',17.745,17.715,83.315,83.280,'geojson/ward-1.json'),
  ('2','Gopalapatnam',  17.778,17.748,83.278,83.245,'geojson/ward-2.json'),
  ('3','Maddilapalem',  17.728,17.700,83.302,83.270,'geojson/ward-3.json'),
  ('4','Asilmetta',     17.710,17.685,83.230,83.200,'geojson/ward-4.json'),
  ('5','Dwaraka Nagar', 17.695,17.668,83.220,83.190,'geojson/ward-5.json')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
