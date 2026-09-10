import json
import rasterio, fiona, shapefile, gpxpy
from shapely.geometry import shape, mapping, box, Point
from db import get_data_source, insert_source_feature, set_status
from r2 import download
from spatial.geo_transform import reproject_to_wgs84, detect_crs
from spatial.topology import validate_and_fix

def geotiff_adapter(path):
    with rasterio.open(path) as ds:
        b = ds.bounds
        yield {"geometry": box(b.left, b.bottom, b.right, b.top),
               "properties": {"bands": ds.count, "res": ds.res, "dtype": ds.dtypes[0]}}, str(ds.crs)

def vector_adapter(path):
    if path.lower().endswith(".shp"):
        r = shapefile.Reader(path)
        for sr in r.shapeRecords():
            yield {"geometry": shape(sr.shape.__geo_interface__),
                   "properties": dict(zip([f[0] for f in r.fields[1:]], sr.record))}, None
    else:                                           # GeoJSON
        gj = json.load(open(path))
        for feat in gj.get("features", [gj]):
            yield {"geometry": shape(feat["geometry"]), "properties": feat.get("properties", {})}, \
                  (gj.get("crs", {}).get("properties", {}).get("name"))

def point_adapter(path):
    if path.lower().endswith(".gpx"):
        g = gpxpy.parse(open(path))
        for wpt in g.waypoints:
            yield {"geometry": Point(wpt.longitude, wpt.latitude),
                   "properties": {"name": wpt.name, "ele": wpt.elevation}}, "EPSG:4326"
    else:                                           # CSV: lon,lat,<attrs>
        import csv
        for row in csv.DictReader(open(path)):
            yield {"geometry": Point(float(row["lon"]), float(row["lat"])),
                   "properties": {k: v for k, v in row.items() if k not in ("lon", "lat")}}, "EPSG:4326"

ADAPTERS = {
    "drone_imagery": geotiff_adapter, "ori": geotiff_adapter, "dsm_dtm": geotiff_adapter,
    "cadastral": vector_adapter, "revenue": vector_adapter, "municipal_gis": vector_adapter,
    "utility": vector_adapter, "building_footprint": vector_adapter,
    "ground_truth": point_adapter, "gnss_cors": point_adapter,
}

def normalize_source(job):
    src = get_data_source(job["sourceId"])
    path = download(job["r2Key"])
    try:
        adapter = ADAPTERS[job["type"]]
        count = 0
        for rec, embedded_crs in adapter(path):
            crs = src["crs"] or embedded_crs or detect_crs(path)
            if not crs:
                raise ValueError("no CRS: declare one on upload")
            geom = reproject_to_wgs84(rec["geometry"], crs)          # B.2
            geom, was_invalid = validate_and_fix(geom)               # B.4
            insert_source_feature(src["id"], mapping(geom), rec["properties"], was_invalid)
            count += 1
        set_status(src["id"], "ready")
        print(f"[normalize] {src['id']} -> {count} features")
    except Exception as e:                                           # noqa: BLE001
        set_status(src["id"], "failed", str(e)); raise
