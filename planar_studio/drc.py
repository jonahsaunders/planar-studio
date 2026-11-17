"""Run KiCad DRC on disposable baseline and placement copies of a board."""

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from collections import Counter
from pathlib import Path

from .kicad_link import BoardEditError, Placement


_TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+')


def _children(text):
    """Yield offsets of immediate expressions, preserving the native board text."""
    depth = 0
    for token in _TOKEN.finditer(text):
        if token[0] == "(":
            if depth == 1:
                start = token.start()
            depth += 1
        elif token[0] == ")":
            depth -= 1
            if depth == 1:
                yield start, token.end()
    if depth:
        raise BoardEditError("KiCad returned an incomplete board snapshot.")


def _atoms(expression):
    for match in _TOKEN.finditer(expression):
        value = match[0]
        if value not in ("(", ")"):
            yield json.loads(value) if value.startswith('"') else value


def _quote(value):
    return json.dumps(str(value), ensure_ascii=False)


def _number(value):
    value = float(value)
    if not math.isfinite(value):
        raise BoardEditError("DRC preview coordinates and dimensions must be finite.")
    return f"{value:.6f}"


def _candidate(text, placement, removed, live_nets=None):
    if not re.match(r"\s*\(kicad_pcb\b", text):
        raise BoardEditError("A complete KiCad board is required for DRC.")
    fields = list(_children(text))
    netcodes = {}
    version = 0
    for a, b in fields:
        if text.startswith("(net ", a):
            atoms = _atoms(text[a:b])
            next(atoms)
            code, name = next(atoms, ""), next(atoms, "")
            if code.isnumeric():
                netcodes[name] = code
        elif text.startswith("(version ", a):
            version = int(text[a:b].split()[1].rstrip(")"))

    removed = set(removed)
    chunks = []
    cursor = 0
    if removed:
        for a, b in fields:
            item = text[a:b]
            if not item.startswith(("(segment", "(arc", "(via", "(footprint", "(gr_text")):
                continue
            if any(_uuid_matches(item[x:y], removed) for x, y in _children(item)):
                chunks.append(text[cursor:a])
                cursor = b
    end = text.rfind(")")
    chunks.append(text[cursor:end])

    ox, oy = placement.origin
    names = set(live_nets) if live_nets is not None else None
    named_nets = version >= 20260101

    def net(spec, pad=False):
        name = spec.get("net")
        if not name:
            return ""
        if names is not None and name not in names:
            raise BoardEditError(f"KiCad net {name!r} is unavailable. Remap it before checking DRC.")
        if named_nets:
            return f" (net {_quote(name)})"
        if name not in netcodes:
            raise BoardEditError(f"KiCad net {name!r} is missing from the board snapshot.")
        suffix = f" {_quote(name)}" if pad else ""
        return f" (net {netcodes[name]}{suffix})"

    def xy(point, offset=True):
        x, y = map(float, point)
        return f"{_number(x + ox if offset else x)} {_number(y + oy if offset else y)}"

    def identity():
        return f' (uuid "{uuid.uuid4()}")'

    def conductor(spec):
        return f' (width {_number(spec.get("width", 0.25))}) (layer {_quote(spec["layer"])}){net(spec)}{identity()}'

    for spec in placement.tracks:
        pts = spec.get("pts") or []
        for a, b in zip(pts, pts[1:]):
            start, finish = xy(a), xy(b)
            if start != finish:
                chunks.append(f'\n (segment (start {start}) (end {finish}){conductor(spec)})')
    for spec in placement.arcs:
        points = "".join(f" ({tag} {xy(spec[tag])})" for tag in ("start", "mid", "end"))
        chunks.append(f"\n (arc{points}{conductor(spec)})")
    for spec in placement.vias:
        at = xy((spec["x"], spec["y"]))
        chunks.append(f'\n (via (at {at}) (size {_number(spec.get("diameter", 0.6))})'
                      f' (drill {_number(spec.get("drill", 0.3))}) (layers "F.Cu" "B.Cu"){net(spec)}{identity()})')
    if placement.pads:
        chunks.append(f'\n (footprint "Placement" (layer "F.Cu") (at {xy((0, 0))}){identity()} (attr smd)')
        chunks.append(f'\n  (property "Reference" {_quote(placement.name)} (at 0 0 0) (layer "F.SilkS")'
                      ' (effects (font (size 1 1) (thickness 0.15)) (hide yes)))')
        for spec in placement.pads:
            shape = "rect" if spec.get("shape") == "rect" else "circle"
            layer = spec["layer"]
            mask = f' {_quote(layer.replace(".Cu", ".Mask"))}' if spec.get("mask", True) else ""
            at = xy((spec["x"], spec["y"]), offset=False)
            size = f'{_number(spec["w"])} {_number(spec["h"])}'
            chunks.append(f'\n  (pad {_quote(spec.get("number", ""))} smd {shape} (at {at}) (size {size})'
                          f' (layers {_quote(layer)}{mask}){net(spec, pad=True)}{identity()})')
        chunks.append("\n )")
    for spec in placement.texts:
        at = xy((spec["x"], spec["y"]))
        chunks.append(f'\n (gr_text {_quote(spec.get("value", ""))} (at {at})'
                      f' (layer {_quote(spec.get("layer") or "F.SilkS")}){identity()}'
                      ' (effects (font (size 1 1) (thickness 0.15))))')
    chunks.append("\n)\n")
    return "".join(chunks)


def _uuid_matches(field, ids):
    atoms = _atoms(field)
    return next(atoms, "") in ("uuid", "tstamp") and next(atoms, "") in ids


def find_cli():
    override = os.environ.get("PLANAR_STUDIO_KICAD_CLI")
    if override:
        return shutil.which(override)
    cli = shutil.which("kicad-cli")
    if cli:
        return cli
    if os.name == "nt":
        root = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "KiCad"
        versions = sorted(root.glob("*/bin/kicad-cli.exe"), reverse=True,
                          key=lambda exe: tuple(map(int, re.findall(r"\d+", exe.parents[1].name))))
        if versions:
            return str(versions[0])
    if sys.platform == "darwin":
        cli = Path("/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
        if cli.is_file():
            return str(cli)
    return None


def _can_refill_zones(cli):
    try:
        help_text = subprocess.run([cli, "pcb", "drc", "--help"], capture_output=True,
                                   timeout=5, check=False).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    return b"--refill-zones" in help_text


def _report(cli, board, refill_zones):
    output = board.with_suffix(".json")
    args = [cli, "pcb", "drc", "--format", "json", "--units", "mm", "--all-track-errors",
            "--severity-error", "--severity-warning", "--exit-code-violations"]
    if refill_zones:
        args.append("--refill-zones")
    args.extend(["--output", str(output), str(board)])
    try:
        run = subprocess.run(args, cwd=board.parent, capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=50, check=False)
        if run.returncode not in (0, 5) or not output.is_file():
            reason = (run.stderr or run.stdout).strip().splitlines()
            raise BoardEditError(reason[-1] if reason else "KiCad could not check the board copy.")
        report = json.loads(output.read_text(encoding="utf-8"))
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        raise BoardEditError(f"Could not read the KiCad DRC report: {exc}") from exc
    return [item for section in ("violations", "unconnected_items") for item in report.get(section, [])]


def _finding_key(item):
    # Older boards can get random IDs when KiCad loads the same file twice.
    # Compare physical references, including their location, across copies.
    refs = tuple(sorted(
        (str(ref.get("description", "")), json.dumps(ref.get("pos"), sort_keys=True))
        for ref in item.get("items", [])
    ))
    return (item.get("type"), item.get("severity"), item.get("description"), refs)


def _read_project_rules(board):
    if not board.is_absolute() or not board.is_file():
        raise BoardEditError("Save this PCB in KiCad so the checker can locate its project rules.")
    rules = {}
    try:
        for extension in (".kicad_pro", ".kicad_dru"):
            path = board.with_suffix(extension)
            if path.is_file():
                rules[path.name] = path.read_bytes()
    except OSError as exc:
        raise BoardEditError(f"Could not read the project rules: {exc}") from exc
    return rules


def _rules_revision(rules):
    return hashlib.sha256(repr(sorted(rules.items())).encode("utf-8")).hexdigest()


def current_rules_revision(snapshot):
    return _rules_revision(_read_project_rules(Path(snapshot.get("boardId") or "")))


def compare_placement(snapshot, placement: Placement):
    cli = find_cli()
    if not cli:
        raise BoardEditError("KiCad’s command-line checker was unavailable. Open the board in KiCad to run DRC.")
    board = Path(snapshot.get("boardId") or "")
    rules = _read_project_rules(board)
    text = snapshot["text"]
    candidate = _candidate(text, placement, snapshot["excludedIds"], snapshot.get("nets"))
    refill_zones = _can_refill_zones(cli)
    with tempfile.TemporaryDirectory(prefix="planar-drc-") as temp:
        results = []
        for label, pcb in (("baseline", text), ("candidate", candidate)):
            folder = Path(temp, label)
            folder.mkdir()
            for name, data in rules.items():
                folder.joinpath(name).write_bytes(data)
            copy = folder / board.name
            copy.write_text(pcb, encoding="utf-8")
            results.append(_report(cli, copy, refill_zones))
    baseline, proposed = results
    remaining = Counter(map(_finding_key, baseline))
    added = []
    for item in proposed:
        key = _finding_key(item)
        if remaining[key]:
            remaining[key] -= 1
        else:
            added.append(item)
    errors = [i for i in added if i.get("severity") == "error"]
    return {"baselineCount": len(baseline), "candidateCount": len(proposed),
            "newErrorCount": len(errors), "findings": added[:200],
            "blockingErrorCount": sum(i.get("type") != "unconnected_items" for i in errors),
            "newCount": len(added), "rulesRevision": _rules_revision(rules),
            "refilledZones": refill_zones,
            "customRules": board.with_suffix(".kicad_dru").name in rules,
            "projectSettings": board.with_suffix(".kicad_pro").name in rules}
