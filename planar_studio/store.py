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
import uuid
from contextlib import contextmanager, suppress
from typing import Any, Dict, List, Optional

SCHEMA = 1
UNSPECIFIED = object()


class StoreError(OSError):
    """The requested state change could not be written to disk."""


class DesignConflict(StoreError):
    """Another editor has changed the design since this client opened it."""


def _revision(entry):
    if entry is None:
        return None
    return entry.get("revision") or f"legacy-{entry.get('saved', 0)}"


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
        self._seen: Dict[str, str] = {}

    # ------------------------------------------------------------------ i/o

    def _read_state(self) -> Dict[str, Any]:
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, dict) or data.get("schema") != SCHEMA:
                raise ValueError("unrecognized state schema")
            for section in ("prefs", "designs", "placements"):
                if not isinstance(data.setdefault(section, {}), dict):
                    raise ValueError(f"invalid {section} section")
            return data
        except FileNotFoundError:
            return {"schema": SCHEMA, "prefs": {}, "designs": {}, "placements": {}}
        except (OSError, ValueError) as exc:
            raise StoreError(f"Could not read {self.path}: {exc}") from exc

    @contextmanager
    def _edit(self):
        # Lock a stable sidecar: replacing state.json changes its file identity.
        with self._lock:
            try:
                os.makedirs(self.dir, exist_ok=True)
                with open(self.path + ".lock", "a+b") as lock:
                    if os.name == "nt":
                        import msvcrt
                        lock.seek(0)
                        msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
                    # Closing the handle releases the lock, including on exceptions.
                    data = self._read_state()
                    yield data
                    self._write(data)
            except StoreError:
                raise
            except OSError as exc:
                raise StoreError(f"Could not save Planar Studio data to {self.path}: {exc}") from exc

    def _write(self, data: Dict[str, Any]) -> None:
        tmp = None
        try:
            fd, tmp = tempfile.mkstemp(dir=self.dir, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1)
            # A Windows reader can briefly hold the destination without delete sharing.
            for attempt in range(6):
                try:
                    os.replace(tmp, self.path)
                    break
                except PermissionError as exc:
                    if getattr(exc, "winerror", None) not in (5, 32) or attempt == 5:
                        raise
                    time.sleep(0.02 * (attempt + 1))
        finally:
            if tmp:
                with suppress(OSError):
                    os.unlink(tmp)

    # -------------------------------------------------------------- prefs

    def get_prefs(self) -> Dict[str, Any]:
        with self._lock:
            return self._read_state()["prefs"]

    def set_prefs(self, prefs: Dict[str, Any]) -> Dict[str, Any]:
        with self._edit() as data:
            data["prefs"].update(prefs or {})
            return data["prefs"]

    # ------------------------------------------------------------- designs

    def list_designs(self) -> List[Dict[str, Any]]:
        with self._lock:
            out = [
                {"id": k, "name": v.get("name", k), "saved": v.get("saved", 0), "kind": v.get("kind", "")}
                for k, v in self._read_state()["designs"].items()
            ]
        out.sort(key=lambda d: d.get("saved", 0), reverse=True)
        return out

    def _check_revision(self, design_id, entry, expected):
        if expected is UNSPECIFIED:
            expected = self._seen.get(design_id)
        if expected != _revision(entry):
            raise DesignConflict("This design changed in another session. Reopen the latest version "
                                 "or use Save a copy to keep your edits separately.")

    def save_design(self, design_id: str, name: str, kind: str, config: Dict[str, Any],
                    expected_revision=UNSPECIFIED) -> str:
        with self._lock:
            with self._edit() as data:
                self._check_revision(design_id, data["designs"].get(design_id), expected_revision)
                revision = uuid.uuid4().hex
                data["designs"][design_id] = {"name": name, "kind": kind, "config": config,
                                             "saved": time.time(), "revision": revision}
            self._seen[design_id] = revision
            return revision

    def load_design(self, design_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            entry = self._read_state()["designs"].get(design_id)
            if entry is None:
                self._seen.pop(design_id, None)
                return None
            entry["revision"] = self._seen[design_id] = _revision(entry)
            return entry

    def delete_design(self, design_id: str, expected_revision=UNSPECIFIED) -> bool:
        with self._lock:
            with self._edit() as data:
                self._check_revision(design_id, data["designs"].get(design_id), expected_revision)
                deleted = data["designs"].pop(design_id, None) is not None
            self._seen.pop(design_id, None)
            return deleted

    # ---------------------------------------------------------- placements

    def record_placement(
        self, design_id: str, board: str, ids: List[str], meta: Optional[Dict[str, Any]] = None,
        inherited: Optional[Dict[str, Any]] = None,
    ) -> None:
        with self._edit() as data:
            key = f"{board}::{design_id}"
            previous = data["placements"].get(key)
            history = []
            seen = set()
            for source in (previous, inherited):
                if source is None:
                    continue
                for record in (source, *source.get("history", [])):
                    identity = frozenset(record["ids"])
                    if identity not in seen:
                        seen.add(identity)
                        history.append({k: record[k] for k in ("ids", "placed", "meta") if k in record})
            entry = {
                "designId": design_id,
                "board": board,
                "ids": ids,
                "placed": time.time(),
                "meta": meta or {},
                "history": history,
            }
            data["placements"][key] = entry

    def get_placement(self, design_id: str, board: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._read_state()["placements"].get(f"{board}::{design_id}")

    def placements_for_board(self, board: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [p for p in self._read_state()["placements"].values() if p["board"] == board]

    def placement_records(self, design_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            records = self._read_state()["placements"].values()
            return [p for p in records if design_id is None or p["designId"] == design_id]

    @staticmethod
    def live_revision(entry: Dict[str, Any], board_ids: set) -> Optional[Dict[str, Any]]:
        """Undo can restore an older revision, including after plugin restart."""
        for revision in (entry, *entry.get("history", [])):
            ids = [item for item in revision["ids"] if item in board_ids]
            if ids:
                return {"designId": entry["designId"], "ids": ids,
                        "placed": revision.get("placed"), "meta": revision.get("meta", {})}
        return None
