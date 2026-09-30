"""Translate reviewed KiCad placements to the exact JLCEDA catalog frame."""
import math


def correct_positions(positions, parts, library):
    byref = {p['ref']: p for p in parts}
    corrected = []
    for row in positions:
        part = byref[row['Ref']]
        entry = library['parts'][part['lcsc']]
        if (part['mpn'] != entry['mpn'] or part['footprint'] != entry['footprint']
                or part['ref'] not in entry['references']):
            raise ValueError(f"{part['ref']}: placement library identity needs review")
        if row['Side'] != 'top':
            raise ValueError('Only reviewed top-side placements are supported')
        angle = float(row['Rot'])
        a = math.radians(angle)
        u, v = entry['origin_in_footprint_mm']
        # KiCad local Y points down; exported board Y points up. Rotate the
        # translation with the footprint, then apply the catalog angle offset.
        x = float(row['PosX']) + u * math.cos(a) + v * math.sin(a)
        y = float(row['PosY']) + u * math.sin(a) - v * math.cos(a)
        rotation = (angle + entry['rotation_offset_deg']) % 360
        corrected.append({**row, 'PosX': f'{x:.6f}', 'PosY': f'{y:.6f}', 'Rot': f'{rotation:.6f}'})
    return corrected
