"""Everything that touches KiCad.

The rest of Planar Studio never imports kipy. It talks to this module, which
either has a live connection or does not, and says which. That boundary is
deliberate: the design tool has to stay fully usable when KiCad is not there
(during development, or when the socket drops mid-session), and the only way to
guarantee that is to keep the binding in one place behind a stable interface.

Two things about the IPC API shape the code below.

Nets cannot be created through the API. A net exists because the schematic says
so. Copper placed by a plugin therefore either joins a net that already exists
or carries none, and joining one is by name -- net codes are not stable and are
deprecated. `resolve_net` does that lookup and returns None rather than
inventing anything.

Item creation is not transactional by default. `place` wraps the whole batch in
one commit so a coil with 4,000 segments is a single Ctrl+Z, and drops the
commit on any failure so a half-built winding is never left on the board.
"""

from __future__ import annotations

import math
import os
import platform
import re
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------
# Optional import. Absence is a supported state, not an error.
# --------------------------------------------------------------------------
KIPY_IMPORT_ERROR: Optional[str] = None
try:  # pragma: no cover - depends on the host environment
    import kipy  # type: ignore
    from kipy import KiCad  # type: ignore
    from kipy.board_types import (  # type: ignore
        ArcTrack,
        BoardLayer,
        BoardText,
        Net,
        Track,
        Via,
    )
    from kipy.geometry import Vector2  # type: ignore
    from kipy.util import from_mm, to_mm  # type: ignore

    HAVE_KIPY = True
except Exception as exc:  # pragma: no cover
    HAVE_KIPY = False
    KIPY_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"

    def from_mm(v: float) -> int:  # type: ignore
        return int(round(v * 1_000_000))

    def to_mm(v: int) -> float:  # type: ignore
        return v / 1_000_000.0


# Canonical copper layer names in stack order. KiCad's own ordering, so the
# index into this list is the index into a board's copper stack.
COPPER_ORDER: List[str] = (
    ["F.Cu"] + [f"In{i}.Cu" for i in range(1, 31)] + ["B.Cu"]
)


class LinkError(RuntimeError):
    """A request needed KiCad and KiCad was not reachable."""


class BoardEditError(RuntimeError):
    """KiCad could not apply a requested board edit."""


@dataclass
class Placement:
    """One batch of copper to put on the board.

    Coordinates are millimetres in KiCad's own convention: +X right, +Y down,
    relative to the board origin. The web side converts out of maths
    convention before it gets here, so this module never flips a sign.
    """

    name: str = "coil"
    design_id: str = ""
    tracks: List[Dict[str, Any]] = field(default_factory=list)
    arcs: List[Dict[str, Any]] = field(default_factory=list)
    vias: List[Dict[str, Any]] = field(default_factory=list)
    pads: List[Dict[str, Any]] = field(default_factory=list)
    texts: List[Dict[str, Any]] = field(default_factory=list)
    origin: Tuple[float, float] = (0.0, 0.0)

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "Placement":
        origin = payload.get("origin") or [0.0, 0.0]
        return cls(
            name=str(payload.get("name") or "coil"),
            design_id=str(payload.get("designId") or ""),
            tracks=list(payload.get("tracks") or []),
            arcs=list(payload.get("arcs") or []),
            vias=list(payload.get("vias") or []),
            texts=list(payload.get("texts") or []),
            pads=list(payload.get("pads") or []),
            origin=(float(origin[0]), float(origin[1])),
        )

    def item_count(self) -> int:
        return len(self.tracks) + len(self.arcs) + len(self.vias) + len(self.texts) + len(self.pads)


@dataclass
class LinkState:
    connected: bool = False
    kicad_version: str = ""
    api_version: str = ""
    board_name: str = ""
    has_board: bool = False
    error: str = ""
    kipy_available: bool = HAVE_KIPY
    import_error: str = KIPY_IMPORT_ERROR or ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "connected": self.connected,
            "kicadVersion": self.kicad_version,
            "apiVersion": self.api_version,
            "boardName": self.board_name,
            "hasBoard": self.has_board,
            "error": self.error,
            "kipyAvailable": self.kipy_available,
            "importError": self.import_error,
            "python": platform.python_version(),
            "platform": platform.system(),
        }


def _socket_path() -> Optional[str]:
    """KiCad hands the socket to the plugin through the environment.

    On Windows this is a named pipe, elsewhere a Unix socket path. kipy wants
    it prefixed, and KiCad supplies it unprefixed, so normalise here.
    """
    raw = os.environ.get("KICAD_API_SOCKET")
    if not raw:
        return None
    if "://" in raw:
        return raw
    if platform.system() == "Windows":
        return raw
    return f"ipc://{raw}"


class KiCadLink:
    """A lazily-established, self-healing connection to the running KiCad.

    Every public method is safe to call with no KiCad present; the ones that
    need it raise LinkError, which the server turns into a clean JSON error the
    UI can show without falling over.
    """

    def __init__(self, client_name: str = "Planar Studio") -> None:
        self._client_name = client_name
        self._kicad: Any = None
        self._lock = threading.RLock()
        self._last_error = ""
        self._last_attempt = 0.0
        self._unsaved_board_scope = uuid.uuid4().hex

    # ---------------------------------------------------------------- connect

    def _connect(self, force: bool = False) -> Any:
        with self._lock:
            if self._kicad is not None and not force:
                return self._kicad
            if not HAVE_KIPY:
                raise LinkError(
                    "kicad-python is not installed in this environment "
                    f"({KIPY_IMPORT_ERROR})."
                )
            # Do not hammer a dead socket on every poll.
            if not force and time.time() - self._last_attempt < 1.5 and self._last_error:
                raise LinkError(self._last_error)
            self._last_attempt = time.time()
            try:
                kwargs: Dict[str, Any] = {"client_name": self._client_name, "timeout_ms": 5000}
                sock = _socket_path()
                if sock:
                    kwargs["socket_path"] = sock
                token = os.environ.get("KICAD_API_TOKEN")
                if token:
                    kwargs["kicad_token"] = token
                kicad = KiCad(**kwargs)  # type: ignore[name-defined]
                kicad.ping()
                self._kicad = kicad
                self._last_error = ""
                return kicad
            except Exception as exc:  # pragma: no cover - environment dependent
                self._kicad = None
                self._last_error = f"{type(exc).__name__}: {exc}"
                raise LinkError(self._last_error) from exc

    def _board(self, force: bool = False) -> Any:
        kicad = self._connect(force=force)
        board = kicad.get_board()
        if board is None:
            raise LinkError("No board is open in KiCad.")
        return board

    def invalidate(self) -> None:
        with self._lock:
            self._kicad = None

    # ----------------------------------------------------------------- status

    def state(self) -> LinkState:
        st = LinkState()
        if not HAVE_KIPY:
            st.error = "kicad-python not importable"
            return st
        try:
            kicad = self._connect()
        except LinkError as exc:
            st.error = str(exc)
            return st
        st.connected = True
        for attr, key in (("get_version", "kicad_version"), ("get_api_version", "api_version")):
            try:
                setattr(st, key, str(getattr(kicad, attr)()))
            except Exception:
                pass
        try:
            board = kicad.get_board()
            if board is not None:
                st.has_board = True
                st.board_name = str(getattr(board, "name", "") or "")
        except Exception as exc:
            st.error = f"{type(exc).__name__}: {exc}"
        return st

    # ---------------------------------------------------------------- context

    def _board_identity(self, board: Any) -> Dict[str, str]:
        name = str(getattr(board, "name", "") or "")
        project = getattr(getattr(board, "document", None), "project", None)
        directory = getattr(project, "path", "")
        path = name if os.path.isabs(name) else ""
        if not path and name and isinstance(directory, str) and os.path.isabs(directory):
            path = os.path.join(directory, name)
        if path and os.path.isfile(path):
            board_id = os.path.normcase(os.path.realpath(path))
        else:
            board_id = f"unsaved:{self._unsaved_board_scope}:{name}"
        return {"name": name, "boardId": board_id}

    def board_context(self) -> Dict[str, Any]:
        """Everything the design side wants to know about the open board.

        Read defensively: a missing accessor on one KiCad point release must
        not cost us the whole context, so each block is guarded on its own and
        contributes whatever it managed to read.
        """
        board = self._board()
        ctx: Dict[str, Any] = {
            **self._board_identity(board),
            "copperLayers": [],
            "layerCount": 0,
            "thickness": None,
            "epsR": None,
            "copperThicknessMm": None,
            "nets": [],
            "activeLayer": None,
            "origin": [0.0, 0.0],
            "warnings": [],
        }

        # --- stack-up ------------------------------------------------------
        stackup = None
        try:
            stackup = board.get_stackup()
            copper, dielectrics, total = _read_stackup(stackup)
            if copper:
                ctx["copperLayers"] = copper
                ctx["layerCount"] = len(copper)
                thicknesses = [c["thicknessMm"] for c in copper if c.get("thicknessMm")]
                if thicknesses:
                    ctx["copperThicknessMm"] = round(sum(thicknesses) / len(thicknesses), 5)
            if dielectrics:
                eps = [d["epsilonR"] for d in dielectrics if d.get("epsilonR")]
                if eps:
                    ctx["epsR"] = round(sum(eps) / len(eps), 4)
                ctx["dielectrics"] = dielectrics
            if total:
                ctx["thickness"] = round(total, 5)
        except Exception as exc:
            ctx["warnings"].append(f"stack-up unavailable ({type(exc).__name__})")

        enabled = _board_layer_names(board, stackup)
        details = {c["name"]: c for c in ctx["copperLayers"]}
        copper = [name for name in COPPER_ORDER if name in enabled]
        ctx["copperLayers"] = [
            {**details.get(name, {"name": name, "thicknessMm": None}), "index": index}
            for index, name in enumerate(copper)
        ]
        ctx["layerCount"] = len(copper)
        if not copper:
            ctx["warnings"].append("Copper layers are unknown. Design and file export remain available.")

        # --- nets ----------------------------------------------------------
        try:
            nets = []
            for net in board.get_nets():
                nm = str(getattr(net, "name", "") or "")
                if nm:
                    nets.append(nm)
            ctx["nets"] = sorted(set(nets))
        except Exception as exc:
            ctx["warnings"].append(f"nets unavailable ({type(exc).__name__})")

        # --- editor state --------------------------------------------------
        try:
            ctx["activeLayer"] = _layer_name(board.get_active_layer())
        except Exception:
            pass
        try:
            sel = board.get_selection()
            ctx["selectionCount"] = len(sel)
            ctx["selectionIds"] = [_kiid(i) for i in sel][:2000]
        except Exception:
            ctx["selectionCount"] = 0
            ctx["selectionIds"] = []

        return ctx

    def board_snapshot(self) -> Dict[str, Any]:
        """Serialize live, including unsaved, board state without saving it."""
        with self._lock:
            board = self._board()
            try:
                text = board.get_as_string()
            except Exception as exc:
                raise LinkError("This KiCad API cannot serialize the board. Import a saved .kicad_pcb in Board checks instead.") from exc
            if not isinstance(text, str) or len(text) > 40_000_000:
                raise LinkError("The board snapshot is unavailable or exceeds 40 MB.")
            result = {**self._board_identity(board), "text": text, "source": "live"}
            try:
                copper, _, _ = _read_stackup(board.get_stackup())
                result["copperLayers"] = copper
            except Exception:
                pass
            try:
                result["nets"] = sorted({net.name for net in board.get_nets() if net.name})
            except Exception:
                pass  # The preview can still read nets from the serialized board.
            return result

    # ------------------------------------------------------------------ nets

    def resolve_net(self, name: Optional[str]) -> Any:
        """Return the board's Net object for `name`, or None.

        The API has no way to create a net, so an unknown name yields None and
        the copper is placed netless -- which is what KiCad itself does for
        manually drawn track on an unassigned net.
        """
        if not name:
            return None
        try:
            board = self._board()
            for net in board.get_nets():
                if str(getattr(net, "name", "")) == name:
                    return net
        except Exception:
            return None
        return None

    # ----------------------------------------------------------------- place

    def place(
        self, placement: Placement, net_name: Optional[str] = None, replace_ids: Sequence[str] = (),
        remember: Optional[Callable[[List[str]], None]] = None,
    ) -> Dict[str, Any]:
        """Create the new placement and retire its predecessor in one undo step."""
        board = self._board()
        items: List[Any] = []
        skipped: List[str] = []

        net = self.resolve_net(net_name)
        net_cache: Dict[str, Any] = {}

        def net_for(spec: Dict[str, Any]) -> Any:
            nm = spec.get("net")
            if not nm:
                return net
            if nm not in net_cache:
                net_cache[nm] = self.resolve_net(nm)
            return net_cache[nm]

        ox, oy = placement.origin

        for spec in placement.tracks:
            layer = _resolve_layer(spec.get("layer"))
            if layer is None:
                skipped.append(f"unknown layer {spec.get('layer')!r}")
                continue
            width = from_mm(float(spec.get("width", 0.25)))
            pts = spec.get("pts") or []
            n = net_for(spec)
            for i in range(1, len(pts)):
                ax, ay = float(pts[i - 1][0]) + ox, float(pts[i - 1][1]) + oy
                bx, by = float(pts[i][0]) + ox, float(pts[i][1]) + oy
                if abs(ax - bx) < 1e-7 and abs(ay - by) < 1e-7:
                    continue
                t = Track()  # type: ignore[name-defined]
                t.start = Vector2.from_xy(from_mm(ax), from_mm(ay))  # type: ignore[name-defined]
                t.end = Vector2.from_xy(from_mm(bx), from_mm(by))  # type: ignore[name-defined]
                t.width = width
                t.layer = layer
                if n is not None:
                    t.net = n
                items.append(t)

        for spec in placement.arcs:
            layer = _resolve_layer(spec.get("layer"))
            if layer is None:
                skipped.append(f"unknown layer {spec.get('layer')!r}")
                continue
            a = ArcTrack()  # type: ignore[name-defined]
            s, m, e = spec["start"], spec["mid"], spec["end"]
            a.start = Vector2.from_xy(from_mm(s[0] + ox), from_mm(s[1] + oy))  # type: ignore[name-defined]
            a.mid = Vector2.from_xy(from_mm(m[0] + ox), from_mm(m[1] + oy))  # type: ignore[name-defined]
            a.end = Vector2.from_xy(from_mm(e[0] + ox), from_mm(e[1] + oy))  # type: ignore[name-defined]
            a.width = from_mm(float(spec.get("width", 0.25)))
            a.layer = layer
            n = net_for(spec)
            if n is not None:
                a.net = n
            items.append(a)

        for spec in placement.vias:
            v = Via()  # type: ignore[name-defined]
            v.position = Vector2.from_xy(  # type: ignore[name-defined]
                from_mm(float(spec["x"]) + ox), from_mm(float(spec["y"]) + oy)
            )
            try:
                v.diameter = from_mm(float(spec.get("diameter", 0.6)))
                v.drill_diameter = from_mm(float(spec.get("drill", 0.3)))
            except Exception as exc:
                skipped.append(f"via size ({type(exc).__name__})")
            n = net_for(spec)
            if n is not None:
                v.net = n
            items.append(v)

        if placement.pads:
            # Pads must live inside a footprint. Never turn an SMD antenna
            # plate or transformer terminal into a through via.
            from kipy.board_types import FootprintInstance, Pad, PadType, PadStackShape
            fp = FootprintInstance()
            fp.layer = BoardLayer.BL_F_Cu
            fp.reference_field.text.value = placement.name
            fp.value_field.text.value = placement.name
            for spec in placement.pads:
                layer = _resolve_layer(spec.get("layer"))
                if layer not in (BoardLayer.BL_F_Cu, BoardLayer.BL_B_Cu):
                    raise BoardEditError("Surface pads require F.Cu or B.Cu.")
                w, h = float(spec["w"]), float(spec["h"])
                x, y = float(spec["x"]), float(spec["y"])
                if not all(math.isfinite(v) for v in (w, h, x, y)) or min(w, h) <= 0:
                    raise BoardEditError("Invalid surface pad dimensions.")
                p = Pad()
                p.pad_type = PadType.PT_SMD
                p.number = str(spec.get("number", ""))
                p.position = Vector2.from_xy(from_mm(x), from_mm(y))
                p.padstack.layers = [layer]
                # A NORMAL padstack defines the shape once, on its front entry,
                # and applies it to each enabled layer, including a back pad.
                shape = p.padstack.copper_layers[0]
                shape.shape = PadStackShape.PSS_RECTANGLE if spec.get("shape") == "rect" else PadStackShape.PSS_CIRCLE
                shape.size = Vector2.from_xy(from_mm(w), from_mm(h))
                if spec.get("mask", True):
                    p.padstack.layers = [layer, BoardLayer.BL_F_Mask if layer == BoardLayer.BL_F_Cu else BoardLayer.BL_B_Mask]
                n = net_for(spec)
                if n is not None:
                    p.net = n
                fp.definition.add_item(p)
            fp.position = Vector2.from_xy(from_mm(ox), from_mm(oy))
            items.append(fp)

        for spec in placement.texts:
            layer = _resolve_layer(spec.get("layer") or "F.SilkS")
            if layer is None:
                skipped.append(f"unknown text layer {spec.get('layer')!r}")
                continue
            t = BoardText()  # type: ignore[name-defined]
            t.position = Vector2.from_xy(  # type: ignore[name-defined]
                from_mm(float(spec["x"]) + ox), from_mm(float(spec["y"]) + oy)
            )
            t.value = str(spec.get("value", ""))
            t.layer = layer
            items.append(t)

        if not items or (replace_ids and skipped):
            reason = skipped[0] if skipped else "no drawable items"
            raise BoardEditError(f"Could not place {placement.name}: {reason}.")

        victims = self._placement_items(board, replace_ids)
        layers = _board_layer_names(board)
        required = set()
        for spec in placement.tracks + placement.arcs + placement.pads:
            name = spec.get("layer")
            if name not in COPPER_ORDER:
                raise BoardEditError(f"Invalid or unknown layer for copper: {name!r}.")
            required.add(name)
        for spec in placement.pads:
            required.add("F.Cu")  # Generated footprint's anchor layer.
            if spec.get("mask", True):
                required.add("F.Mask" if spec["layer"] == "F.Cu" else "B.Mask")
        if placement.vias:
            required.update(("F.Cu", "B.Cu"))  # Through vias.
        required.update(spec.get("layer") or "F.SilkS" for spec in placement.texts)
        missing = required - layers
        if missing:
            raise BoardEditError("KiCad could not confirm these destination layers: "
                                 + ", ".join(sorted(missing)) + ". Check the board stack or export a file.")
        action = "replace" if victims else "place"
        with self._commit(board, f"Planar Studio: {action} {placement.name}"):
            created = board.create_items(items)
            ids = [_kiid(item) for item in created]
            if len(ids) != len(items) or not all(ids) or len(set(ids)) != len(ids):
                raise ValueError("KiCad did not confirm a unique ID for every new item")
            if victims:
                board.remove_items(victims)
            # Persist ownership while KiCad can still roll back a disk failure.
            # If push fails, only revisions actually present on the board resolve.
            if remember:
                remember(ids)
        return {"created": len(ids), "ids": ids, "skipped": skipped, "replaced": len(victims)}

    # ---------------------------------------------------------------- delete

    @staticmethod
    def _placeable_board_items(board: Any) -> Iterable[Any]:
        try:
            for read in (board.get_tracks, board.get_vias, board.get_footprints, board.get_text):
                yield from read()
        except Exception as exc:
            raise BoardEditError(f"Could not read the previous placement: {exc}") from exc

    def placement_item_ids(self) -> set:
        return {_kiid(item) for item in self._placeable_board_items(self._board())}

    def _placement_items(self, board: Any, ids: Sequence[str]) -> List[Any]:
        wanted = set(ids)
        if not wanted:
            return []
        return [item for item in self._placeable_board_items(board) if _kiid(item) in wanted]

    @staticmethod
    @contextmanager
    def _commit(board: Any, message: str):
        try:
            commit = board.begin_commit()
        except Exception as exc:
            raise BoardEditError(f"Could not start the KiCad edit: {exc}") from exc
        try:
            yield
            board.push_commit(commit, message)
        except Exception as exc:
            try:
                board.drop_commit(commit)
            except Exception as rollback_error:
                raise BoardEditError(
                    "KiCad could not confirm the edit or its rollback. Check the board before retrying. "
                    f"Edit: {exc}. Rollback: {rollback_error}"
                ) from exc
            raise BoardEditError(f"KiCad canceled the edit: {exc}") from exc

    def remove_ids(self, ids: Sequence[str]) -> Dict[str, Any]:
        board = self._board()
        victims = self._placement_items(board, ids)
        if victims:
            with self._commit(board, "Planar Studio: remove placement"):
                board.remove_items(victims)
        return {"removed": len(victims)}

    # --------------------------------------------------------------- project

    def project_dir(self) -> Optional[str]:
        """Directory of the open project, for writing a footprint library."""
        try:
            board = self._board()
        except LinkError:
            return None
        for getter in ("document", "get_project"):
            try:
                obj = getattr(board, getter)
                obj = obj() if callable(obj) else obj
            except Exception:
                continue
            for attr in ("board_filename", "project_name", "name", "path"):
                try:
                    val = getattr(obj, attr, None)
                    if isinstance(val, str) and os.sep in val:
                        return os.path.dirname(val)
                except Exception:
                    continue
        return None

    def settings_dir(self) -> Optional[str]:
        try:
            kicad = self._connect()
            return kicad.get_plugin_settings_path("com.jonahsaunders.planarstudio")
        except Exception:
            return None

    def select(self, ids: Sequence[str]) -> None:
        try:
            board = self._board()
            board.clear_selection()
        except Exception:
            return
        if not ids:
            return
        try:
            hits = self._placement_items(board, ids)
            if hits:
                board.add_to_selection(hits)
        except Exception:
            pass

    def refill_zones(self) -> None:
        try:
            self._board().refill_zones(block=False)
        except Exception:
            pass


# --------------------------------------------------------------------------
# Layer helpers. Name-driven, because canonical names are stable across
# releases and the enum member spellings historically have not been.
# --------------------------------------------------------------------------

_LAYER_CACHE: Dict[str, Any] = {}


def _resolve_layer(name: Optional[str]) -> Any:
    if not name:
        return None
    if name in _LAYER_CACHE:
        return _LAYER_CACHE[name]
    if not HAVE_KIPY:
        return None
    value = None
    try:
        from kipy.util.board_layer import layer_from_canonical_name  # type: ignore

        value = layer_from_canonical_name(name)
        if value == BoardLayer.BL_UNKNOWN:
            value = None
    except Exception:
        value = None
    if value is None:
        # Enum spelling: "In1.Cu" -> BL_In1_Cu
        candidate = "BL_" + name.replace(".", "_")
        value = getattr(BoardLayer, candidate, None)  # type: ignore[name-defined]
    if value is None:
        alt = {"F.SilkS": "F_SilkS", "B.SilkS": "B_SilkS"}.get(name)
        if alt:
            value = getattr(BoardLayer, "BL_" + alt, None)  # type: ignore[name-defined]
    if value is not None:
        _LAYER_CACHE[name] = value
    return value


def _layer_name(layer: Any) -> Optional[str]:
    if layer is None:
        return None
    try:
        from kipy.util.board_layer import canonical_name  # type: ignore

        return str(canonical_name(layer))
    except Exception:
        pass
    name = getattr(layer, "name", None)
    if isinstance(name, str):
        return name[3:].replace("_", ".") if name.startswith("BL_") else name
    return None


def _board_layer_names(board: Any, stackup: Any = None) -> set:
    """Read enabled layers from this document, including on older KiCad 9 hosts."""
    try:
        return {_layer_name(layer) for layer in board.get_enabled_layers()} - {None, "Unknown"}
    except Exception:
        pass
    # Older KiCad versions may omit enabled flags from the stack-up response.
    # Their live serialization contains the enabled layer table in the header.
    try:
        text = board.get_as_string()
        table = re.search(
            r'(?m)^[ \t]*\(layers[ \t]*\r?\n((?:[ \t]*\(\d+[^\r\n]*\r?\n)+)[ \t]*\)',
            text[:65_536],
        )
        if table:
            return set(re.findall(r'\(\d+[ \t]+"([^"\r\n]+)"', table[1]))
    except Exception:
        pass
    names = set()
    try:
        stack = stackup if stackup is not None else board.get_stackup()
        for entry in _stack_layers(stack):
            if getattr(entry, "enabled", True):
                names.add(_layer_name(getattr(entry, "layer", None)) or getattr(entry, "name", ""))
    except Exception:
        pass
    if not names.intersection(COPPER_ORDER):
        try:
            count = board.get_copper_layer_count()
            if isinstance(count, int) and 2 <= count <= len(COPPER_ORDER) and count % 2 == 0:
                names.update(COPPER_ORDER[:count - 1] + ["B.Cu"])
        except Exception:
            pass
    return names - {None, "", "Unknown"}


def _kiid(item: Any) -> str:
    for attr in ("id", "kiid"):
        val = getattr(item, attr, None)
        if val is None:
            continue
        try:
            inner = getattr(val, "value", None)
            return str(inner if inner is not None else val)
        except Exception:
            continue
    return ""


def _stack_layers(stackup: Any) -> list:
    for attr in ("layers", "layer", "stackup_layers"):
        items = getattr(stackup, attr, None)
        if items is not None:
            try:
                return list(items)
            except TypeError:
                continue
    return []


def _read_stackup(stackup: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], float]:
    """Pull copper layers, dielectrics and total thickness out of a stack-up.

    The stack-up proto has been through more than one shape; rather than bind
    to one, walk whatever iterable of layers it exposes and read by duck type.
    """
    copper: List[Dict[str, Any]] = []
    dielectrics: List[Dict[str, Any]] = []
    total = 0.0
    heights_known = True

    for entry in _stack_layers(stackup):
        thickness = None
        for attr in ("thickness", "thickness_nm"):
            raw = getattr(entry, attr, None)
            if isinstance(raw, (int, float)) and raw:
                thickness = to_mm(int(raw))
                break
        if thickness:
            total += thickness

        name = _layer_name(getattr(entry, "layer", None)) or str(getattr(entry, "name", "") or "")
        kind = getattr(entry, "type", None)
        is_dielectric = kind == 2 or "diel" in str(kind).lower()  # BSLT_DIELECTRIC
        if not thickness and (name.endswith(".Cu") or is_dielectric):
            heights_known = False

        if name and name.endswith(".Cu"):
            copper.append(
                {
                    "name": name,
                    "index": len(copper),
                    "thicknessMm": round(thickness, 6) if thickness else None,
                    "centerHeightMm": round(total - thickness / 2, 6) if thickness else None,
                }
            )
            continue

        eps = None
        loss = None
        material = ""
        sublayers = getattr(entry, "dielectric", None)
        probe = [entry] if sublayers is None else list(getattr(sublayers, "layers", []) or [sublayers])
        for sub in probe:
            for attr in ("epsilon_r", "epsilonr", "eps_r"):
                raw = getattr(sub, attr, None)
                if isinstance(raw, (int, float)) and raw > 0:
                    eps = float(raw)
                    break
            for attr in ("loss_tangent", "loss_tan"):
                raw = getattr(sub, attr, None)
                if isinstance(raw, (int, float)) and raw > 0:
                    loss = float(raw)
                    break
            raw = getattr(sub, "material", None)
            if isinstance(raw, str) and raw:
                material = raw
        if is_dielectric or eps:
            dielectrics.append(
                {
                    "name": name or material or "dielectric",
                    "epsilonR": eps,
                    "lossTangent": loss,
                    "thicknessMm": round(thickness, 6) if thickness else None,
                    "material": material,
                }
            )

    if not heights_known:
        for layer in copper:
            layer.pop("centerHeightMm", None)
    return copper, dielectrics, round(total, 6)
