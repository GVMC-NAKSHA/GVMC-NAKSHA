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
    zone = int((ward_centroid.x + 180) // 6) + 1
    epsg = 32600 + zone                              # northern hemisphere
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return shp_transform(t.transform, geom)

def detect_crs(path: str) -> str | None:
    try:
        if path.lower().endswith((".tif", ".tiff")):
            with rasterio.open(path) as ds:
                return str(ds.crs) if ds.crs else None
        with fiona.open(path) as src:
            return src.crs.get("init") or (src.crs_wkt and CRS.from_wkt(src.crs_wkt).to_string())
    except Exception:
        return None
