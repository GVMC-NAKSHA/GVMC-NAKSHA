from shapely.validation import make_valid

def validate_and_fix(geom):
    if geom.is_valid:
        return geom, False
    fixed = make_valid(geom)
    if not fixed.is_valid:
        fixed = fixed.buffer(0)
    return fixed, True
