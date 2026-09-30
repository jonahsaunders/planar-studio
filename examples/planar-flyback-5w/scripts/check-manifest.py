"""Check publication integrity; --write normalizes UTF-8 text to LF and refreshes hashes."""
import argparse
import hashlib
import json
from pathlib import Path

R = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write', action='store_true')
args = parser.parse_args()
ignored = {'.kicad-config', '__pycache__', 'schematic-svg'}
manifest = R / 'SHA256SUMS.json'
files = sorted(f for f in R.rglob('*') if f.is_file() and f != manifest
               and not ignored.intersection(f.relative_to(R).parts)
               and not any(p.endswith('-backups') for p in f.relative_to(R).parts)
               and f.suffix not in {'.kicad_prl', '.lck', '.pyc'})
hashes = {}
for file in files:
    data = file.read_bytes()
    if args.write and file.suffix not in {'.png', '.zip', '.glb', '.stp'}:
        data = data.decode('utf8').replace('\r\n', '\n').encode('utf8')
        if file.suffix == '.svg':
            # KiCad emits trailing spaces in SVG markup; preserve line breaks.
            data = b'\n'.join(line.rstrip(b' \t') for line in data.split(b'\n'))
        if file.suffix == '.kicad_dru':
            data = data.rstrip()+b'\n'
        file.write_bytes(data)
    hashes[file.relative_to(R).as_posix()] = hashlib.sha256(data).hexdigest()
if args.write:
    manifest.write_text(json.dumps(hashes, indent=2) + '\n', encoding='utf8', newline='\n')
else:
    expected = json.loads(manifest.read_text(encoding='utf8'))
    changed = sorted(k for k in expected.keys() | hashes.keys() if expected.get(k) != hashes.get(k))
    if changed:
        raise SystemExit('Manifest mismatch:\n' + '\n'.join(changed))
print(f'{len(hashes)} file hashes {"recorded" if args.write else "verified"}.')
