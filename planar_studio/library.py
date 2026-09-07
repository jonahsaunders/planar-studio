"""Writing footprints into a project-local library, and registering it.

Placing raw tracks gets copper onto the board immediately, which is what you
want while you are still deciding the geometry. A footprint is what you want
once the design is settled: it moves as one object, survives a re-route, and
can be dropped into the next board.

KiCad will not see a .pretty folder it has not been told about, so writing the
file is only half the job -- `ensure_registered` adds the row to the project's
fp-lib-table, creating the table if the project does not have one yet. The
parser here is deliberately small: fp-lib-table is a flat s-expression with one
level of nesting, and a full reader would be more code and more ways to corrupt
a file we did not write.
"""

from __future__ import annotations

import os
import re
from typing import Dict, List, Optional, Tuple

LIB_DIR_NAME = "planar-studio.pretty"
LIB_NICKNAME = "planar-studio"


def _sanitise(name: str) -> str:
    """A filename KiCad will accept as a footprint name."""
    cleaned = re.sub(r"[^A-Za-z0-9._+-]+", "_", name).strip("_")
    return cleaned or "coil"


def write_footprint(project_dir: str, name: str, text: str) -> str:
    """Write `text` as <project>/planar-studio.pretty/<name>.kicad_mod."""
    if not project_dir or not os.path.isdir(project_dir):
        raise ValueError("no project directory to write into")
    lib_dir = os.path.join(project_dir, LIB_DIR_NAME)
    os.makedirs(lib_dir, exist_ok=True)
    path = os.path.join(lib_dir, _sanitise(name) + ".kicad_mod")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return path


def ensure_registered(project_dir: str) -> Tuple[bool, str]:
    """Make sure the project's fp-lib-table lists the library.

    Returns (changed, message). Never raises on a malformed existing table --
    a plugin that corrupts a library table is worse than one that does not
    register itself, so anything unexpected is reported and left alone.
    """
    table = os.path.join(project_dir, "fp-lib-table")
    row = (
        f'  (lib (name "{LIB_NICKNAME}")(type "KiCad")'
        f'(uri "${{KIPRJMOD}}/{LIB_DIR_NAME}")(options "")'
        f'(descr "Planar Studio generated footprints"))'
    )

    if not os.path.exists(table):
        with open(table, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("(fp_lib_table\n  (version 7)\n" + row + "\n)\n")
        return True, f"created {os.path.basename(table)} and registered '{LIB_NICKNAME}'"

    try:
        with open(table, "r", encoding="utf-8") as fh:
            body = fh.read()
    except OSError as exc:
        return False, f"could not read fp-lib-table ({exc})"

    if f'(name "{LIB_NICKNAME}")' in body or f"(name {LIB_NICKNAME})" in body:
        return False, f"'{LIB_NICKNAME}' already registered"

    close = body.rstrip().rfind(")")
    if close < 0:
        return False, "fp-lib-table is not a recognisable s-expression; left untouched"

    updated = body.rstrip()[:close].rstrip() + "\n" + row + "\n)\n"
    try:
        with open(table + ".planarstudio.bak", "w", encoding="utf-8", newline="\n") as fh:
            fh.write(body)
        with open(table, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(updated)
    except OSError as exc:
        return False, f"could not write fp-lib-table ({exc})"
    return True, f"registered '{LIB_NICKNAME}' in the project footprint library table"


def list_footprints(project_dir: str) -> List[Dict[str, object]]:
    lib_dir = os.path.join(project_dir or "", LIB_DIR_NAME)
    if not os.path.isdir(lib_dir):
        return []
    out: List[Dict[str, object]] = []
    for entry in sorted(os.listdir(lib_dir)):
        if not entry.endswith(".kicad_mod"):
            continue
        full = os.path.join(lib_dir, entry)
        try:
            stat = os.stat(full)
        except OSError:
            continue
        out.append(
            {
                "name": entry[: -len(".kicad_mod")],
                "path": full,
                "bytes": stat.st_size,
                "modified": stat.st_mtime,
            }
        )
    return out
