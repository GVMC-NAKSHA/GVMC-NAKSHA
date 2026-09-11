import json
from pyproj import Transformer, CRS
from shapely.geometry import shape, mapping
from shapely.ops import transform as shp_transform
import rasterio, fiona

def reproject_to_wgs84(geom, source_crs: str):
    if CRS.from_user_input(source_crs).to_epsg() == 4326:
        return geom
    t = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    return shp_transform(t.transform, geom)

def to_utm(geom, ward_centroid):
    # Unused today — matching runs in `geography`, so metric ops need no projected CRS.
    # Kept for future work (parcel-fabric topology, DSM/DTM sampling) that wants a metre CRS.
    zone = int((ward_centroid.x + 180) // 6) + 1
    epsg = 32600 + zone                              # northern hemisphere
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return shp_transform(t.transform, geom)

def detect_crs(path: str) -> str | None:
    try:
        if path.lower().endswith((".tif", ".tiff")):
            with rasterio.open(path) as ds:
                return str(ds.crs) if ds.crs else None
        if path.lower().endswith((".geojson", ".json")):
            # RFC 7946: GeoJSON with no `crs` member is WGS84 lon/lat.
            gj = json.load(open(path))
            named = gj.get("crs", {}).get("properties", {}).get("name")
            return named or "EPSG:4326"
        with fiona.open(path) as src:
            crs = src.crs
            init = crs.get("init") if hasattr(crs, "get") else None
            return init or (src.crs_wkt and CRS.from_wkt(src.crs_wkt).to_string()) or None
    except Exception:
        return None
