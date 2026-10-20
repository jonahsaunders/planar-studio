"""Measure winding self-spacing and check final copper against its routed path.

KiCad Python only. Net-tie DRC and centerline containment alone cannot catch
extra copper or sub-rule spacing within one winding polygon. This check is
specific to this example's simple, two-turn-per-layer generated windings.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re

import pcbnew as pcb

ROOT = Path(__file__).resolve().parents[1]
LAYERS = {'F.Cu', 'B.Cu', 'In1.Cu', 'In4.Cu'}
ENVELOPE_TOLERANCE_MM = .0015
ADJACENT_PATH_MM = 2.0


def closest(a, b, c, d):
    def sub(p, q): return p[0]-q[0], p[1]-q[1]
    def cross(p, q): return p[0]*q[1]-p[1]*q[0]
    v, w, u = sub(b, a), sub(d, c), sub(c, a)
    den = cross(v, w)
    if abs(den) > 1e-16:
        t, s = cross(u, w)/den, cross(u, v)/den
        if 0 <= t <= 1 and 0 <= s <= 1:
            p = (a[0]+t*v[0], a[1]+t*v[1])
            return 0.0, p, p
    def project(p, q, r):
        v = sub(r, q); u = sub(p, q); length2 = v[0]**2+v[1]**2
        t = max(0, min(1, (u[0]*v[0]+u[1]*v[1])/length2)) if length2 else 0
        return q[0]+t*v[0], q[1]+t*v[1]
    pairs = [(a, project(a,c,d)), (b, project(b,c,d)),
             (project(c,a,b),c), (project(d,a,b),d)]
    return min((math.dist(p,q),p,q) for p,q in pairs)


def vector(p): return pcb.VECTOR2I(pcb.FromMM(p[0]), pcb.FromMM(p[1]))


def polygon(points):
    poly = pcb.SHAPE_POLY_SET(); poly.NewOutline()
    for p in points: poly.Append(vector(p).x, vector(p).y)
    return poly


def rings(poly):
    return [[pcb.ToMM(poly.COutline(k).CPoint(j)) for j in range(poly.COutline(k).PointCount())]
            for k in range(poly.OutlineCount())]


def stroke(points, width, layer):
    result = pcb.SHAPE_POLY_SET()
    for a,b in zip(points,points[1:]):
        shape = pcb.PCB_SHAPE(); shape.SetShape(pcb.SHAPE_T_SEGMENT)
        shape.SetStart(vector(a)); shape.SetEnd(vector(b)); shape.SetWidth(pcb.FromMM(width))
        part = pcb.SHAPE_POLY_SET()
        shape.TransformShapeToPolygon(part,layer,0,pcb.FromMM(.0001),pcb.ERROR_OUTSIDE)
        result.BooleanAdd(part)
    result.Simplify()
    return result


def inspect(board, artwork, minimum=.20):
    t1 = next(f for f in board.GetFootprints() if f.GetReference()=='T1')
    assert t1.GetOrientationDegrees()==0, 'Update transform handling before rotating T1'
    origin = pcb.ToMM(t1.GetPosition())
    graphics = [g for g in t1.GraphicalItems() if isinstance(g,pcb.PCB_SHAPE) and g.GetLayerName() in LAYERS]
    assert len(graphics)==4 and {g.GetLayerName() for g in graphics}==LAYERS
    assert len(artwork['tracks'])==4 and {t['layer'] for t in artwork['tracks']}==LAYERS
    result={'layers':{},'violations':[]}
    for track in artwork['tracks']:
        layer = track['layer']; width = track['width']
        points = [(origin[0]+x,origin[1]-y) for x,y in track['pts']]
        cumulative=[0]
        for a,b in zip(points,points[1:]): cumulative.append(cumulative[-1]+math.dist(a,b))
        best=(math.inf,None,None,None,None); pairs=0
        for i,(a,b) in enumerate(zip(points,points[1:])):
            for j in range(i+1,len(points)-1):
                if cumulative[j]-cumulative[i+1] < ADJACENT_PATH_MM: continue
                gap,p,q=closest(a,b,points[j],points[j+1]); pairs+=1
                if gap-width<best[0]: best=(gap-width,i,j,p,q)
        g=next(g for g in graphics if g.GetLayerName()==layer)
        actual=pcb.SHAPE_POLY_SET(g.GetPolyShape())
        expected=stroke(points,width,g.GetLayer())
        outer=pcb.SHAPE_POLY_SET(expected)
        outer.Inflate(pcb.FromMM(ENVELOPE_TOLERANCE_MM),pcb.CORNER_STRATEGY_ROUND_ALL_CORNERS,pcb.FromMM(.0001))
        extra=pcb.SHAPE_POLY_SET(actual);extra.BooleanSubtract(outer)
        inner=pcb.SHAPE_POLY_SET(expected)
        inner.Inflate(-pcb.FromMM(ENVELOPE_TOLERANCE_MM),pcb.CORNER_STRATEGY_ROUND_ALL_CORNERS,pcb.FromMM(.0001))
        missing=pcb.SHAPE_POLY_SET(inner);missing.BooleanSubtract(actual)
        # Confirm the actual copper edges at the tightest nominal turn pair.
        p,q=best[3:]
        x0,x1=min(p[0],q[0])-.5,max(p[0],q[0])+.5
        y0,y1=min(p[1],q[1])-.5,max(p[1],q[1])+.5
        local=pcb.SHAPE_POLY_SET(actual)
        local.BooleanIntersection(polygon([(x0,y0),(x1,y0),(x1,y1),(x0,y1)]))
        local_gap=None;endpoints=None
        if local.OutlineCount()==2:
            r,s=rings(local)
            local_gap,pa,pb=min(closest(a,b,c,d) for a,b in zip(r,r[1:]+r[:1]) for c,d in zip(s,s[1:]+s[:1]))
            endpoints=[pa,pb]
        issues=[]
        if actual.OutlineCount()!=1 or any(actual.HoleCount(k) for k in range(actual.OutlineCount())):
            issues.append('Disconnected winding or closed copper loop')
        if extra.Area()>0 or missing.Area()>0:issues.append('Final copper differs from routed winding envelope')
        bound=best[0]-2*ENVELOPE_TOLERANCE_MM
        if bound<minimum:issues.append('Conservative nonlocal turn-spacing bound is below minimum')
        if local_gap is None or local_gap<minimum:issues.append('Saved-polygon turn gap is below minimum or cannot be resolved')
        record={'width_mm':width,'segments':len(points)-1,'nonlocal_segment_pairs':pairs,
                'centerline_based_copper_gap_mm':best[0],'conservative_copper_gap_lower_bound_mm':bound,
                'saved_polygon_gap_at_tightest_pair_mm':local_gap,'gap_endpoints_mm':endpoints,
                'closest_segments':best[1:3], 'extra_copper_outside_tolerance_mm2':extra.Area()/1e12,
                'missing_copper_inside_tolerance_mm2':missing.Area()/1e12,'issues':issues}
        result['layers'][layer]=record
        result['violations'] += [{'layer':layer,'issue':issue} for issue in issues]
    result['status']='FAIL' if result['violations'] else 'PASS'
    return result


def inspect_gerbers(board, directory):
    t1=next(f for f in board.GetFootprints() if f.GetReference()=='T1')
    origin=board.GetDesignSettings().GetAuxOrigin()
    report={}
    for layer,extension in [('F.Cu','gtl'),('B.Cu','gbl'),('In1.Cu','g1'),('In4.Cu','g4')]:
        path=directory/f'PS-FLYBACK-5W-{layer.replace(".","_")}.{extension}'
        source=path.read_text()
        assert '%FSLAX46Y46*%' in source and '%MOMM*%' in source
        component=None;region=False;points=[];found=[];dark=True;linear=True
        for line in source.splitlines():
            match=re.fullmatch(r'%TO.C,(.*?)\*%',line)
            if match:component=match[1]
            if line=='%TD*%':component=None
            if line=='%LPC*%':dark=False
            if line=='%LPD*%':dark=True
            if line=='G01*':linear=True
            if line in ['G02*','G03*']:linear=False
            if line=='G36*':
                region=True;points=[]
                if component=='T1':assert dark
            elif line=='G37*':
                if component=='T1':
                    poly=pcb.SHAPE_POLY_SET();poly.NewOutline()
                    for x,y in points:poly.Append(x,y)
                    found.append(poly)
                region=False
            elif region and component=='T1':
                match=re.fullmatch(r'X(-?\d+)Y(-?\d+)D0([12])\*',line)
                if match:
                    assert linear
                    # Gerber 4.6 mm and KiCad coordinates both use 1 nm units.
                    # Keep integers: a float round-trip can truncate a nanometre.
                    points.append((origin.x+int(match[1]),origin.y-int(match[2])))
                else:assert line=='G01*',line
        assert len(found)==1,(layer,'Unexpected Gerber region count')
        native=next(g.GetPolyShape() for g in t1.GraphicalItems() if isinstance(g,pcb.PCB_SHAPE) and g.GetLayerName()==layer)
        extra=pcb.SHAPE_POLY_SET(found[0]);extra.BooleanSubtract(native)
        missing=pcb.SHAPE_POLY_SET(native);missing.BooleanSubtract(found[0])
        assert extra.Area()+missing.Area()==0,(layer,'Gerber differs from verified winding')
        report[layer]={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'native_polygon_match':True}
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--board',type=Path,default=ROOT/'kicad/PS-FLYBACK-5W.kicad_pcb')
    parser.add_argument('--artwork',type=Path,default=ROOT/'planar-studio/T1-artwork.json')
    parser.add_argument('--output',type=Path,default=ROOT/'evidence/audit/winding-integrity-checks.json')
    parser.add_argument('--gerbers',type=Path)
    args=parser.parse_args()
    board=pcb.LoadBoard(str(args.board));artwork=json.loads(args.artwork.read_text())
    spec=json.loads((ROOT/'winding-clearance.json').read_text())
    result=inspect(board,artwork,spec['minimum_finished_copper_gap_mm'])
    if args.gerbers:result['gerber_regions']=inspect_gerbers(board,args.gerbers)
    result.update(revision=board.GetTitleBlock().GetRevision(),minimum_copper_gap_mm=spec['minimum_finished_copper_gap_mm'],
                  envelope_tolerance_mm=ENVELOPE_TOLERANCE_MM,adjacent_path_exclusion_mm=ADJACENT_PATH_MM,
                  board_sha256=hashlib.sha256(args.board.read_bytes()).hexdigest(),
                  artwork_sha256=hashlib.sha256(args.artwork.read_bytes()).hexdigest(),
                  scope='Self-spacing of nonlocal path segments and actual copper envelope for the four simple winding polygons. Segments less than 2 mm apart along the path are adjacent conductor. Complements external-copper clearance and topology audit; not a universal winding verifier or hardware qualification.')
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print(json.dumps(result,indent=2))
    if result['violations']:raise SystemExit('Winding integrity failed')


if __name__=='__main__':main()
