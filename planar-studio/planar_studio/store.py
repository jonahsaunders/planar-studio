"""Persistent state: preferences, saved designs, and what was placed where.

The placement registry is what makes a design editable after the fact. KiCad
board items carry no user fields, so the association between "this coil" and
"those 3,812 track KIIDs" has to live outside the board. It lives here, keyed
by design id, and lets the UI offer to replace a previous placement instead of
stacking a second winding on top of the first.

Writes are atomic (temp file then replace) because the alternative is a
truncated JSON file after a crash, which would lose every stored design rather
than the one being written.
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional

SCHEMA = 1


def default_dir() -> str:
    """Where to keep state when KiCad has not offered a path."""
    env = os.environ.get("PLANAR_STUDIO_HOME")
    if env:
        return env
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, "PlanarStudio")
    if os.uname().sysname == "Darwin":  # type: ignore[attr-defined]
        return os.path.expanduser("~/Library/Application Support/PlanarStudio")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "planar-studio")


class Store:
    def __init__(self, directory: Optional[str] = None) -> None:
        self.dir = directory or default_dir()
        self.path = os.path.join(self.dir, "state.json")
        self._lock = threading.RLock()
        self._data: Dict[str, Any] = {
            "schema": SCHEMA,
            "prefs": {},
            "designs": {},
            "placements": {},
        }
        self._load()

    # ------------------------------------------------------------------ i/o

    def _load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict) and data.get("schema") == SCHEMA:
                self._data.update(
                    {k: data.get(k, v) for k, v in self._data.items() if k != "schema"}
                )
        except (OSError, ValueError):
            pass

    def _flush(self) -> None:
        try:
            os.makedirs(self.dir, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=self.dir, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=1, sort_keys=True)
            os.replace(tmp, self.path)
        except OSError:
            pass

    # -------------------------------------------------------------- prefs

    def get_prefs(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._data["prefs"])

    def set_prefs(self, prefs: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            self._data["prefs"].update(prefs or {})
            self._flush()
            return dict(self._data["prefs"])

    # ------------------------------------------------------------- designs

    def list_designs(self) -> List[Dict[str, Any]]:
        with self._lock:
            out = [
                {"id": k, "name": v.get("name", k), "saved": v.get("saved", 0), "kind": v.get("kind", "")}
                for k, v in self._data["designs"].items()
            ]
        out.sort(key=lambda d: d.get("saved", 0), reverse=True)
        return out

    def save_design(self, design_id: str, name: str, kind: str, config: Dict[str, Any]) -> None:
        with self._lock:
            self._data["designs"][design_id] = {
                "name": name,
                "kind": kind,
                "config": config,
                "saved": time.time(),
            }
            self._flush()

    def load_design(self, design_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = self._data["designs"].get(design_id)
            return dict(entry) if entry else None

    def delete_design(self, design_id: str) -> bool:
        with self._lock:
            existed = self._data["designs"].pop(design_id, None) is not None
            if existed:
                self._flush()
            return existed

    # ---------------------------------------------------------- placements

    def record_placement(
        self, design_id: str, board: str, ids: List[str], meta: Optional[Dict[str, Any]] = None
    ) -> None:
        with self._lock:
            key = f"{board}::{design_id}"
            self._data["placements"][key] = {
                "designId": design_id,
                "board": board,
                "ids": ids,
                "placed": time.time(),
                "meta": meta or {},
            }
            self._flush()

    def get_placement(self, design_id: str, board: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._data["placements"].get(f"{board}::{design_id}")

    def placements_for_board(self, board: str) -> List[Dict[str, Any]]:
        prefix = f"{board}::"
        with self._lock:
            return [v for k, v in self._data["placements"].items() if k.startswith(prefix)]

    def forget_placement(self, design_id: str, board: str) -> None:
        with self._lock:
            if self._data["placements"].pop(f"{board}::{design_id}", None) is not None:
                self._flush()

    def find_by_ids(self, board: str, ids: List[str]) -> Optional[Dict[str, Any]]:
        """Which recorded placement do these selected board items belong to?"""
        wanted = set(i for i in ids if i)
        if not wanted:
            return None
        best, best_hits = None, 0
        for entry in self.placements_for_board(board):
            hits = len(wanted & set(entry.get("ids", [])))
            if hits > best_hits:
                best, best_hits = entry, hits
        return best
