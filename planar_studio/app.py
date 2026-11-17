"""Wiring: the RPC surface the page calls, and the process lifecycle.

Every method here is deliberately shallow. The engineering lives in the web
side (geometry and physics) and in kicad_link (board access); this file only
decides what a request means and turns failures into something the UI can
render. That keeps the trust boundary small and readable: this is the complete
list of things the page is allowed to make the plugin do.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
import time
from typing import Any, Dict, List, Optional

from .kicad_link import BoardEditError, KiCadLink, LinkError, Placement
from . import library
from .server import Api, RpcError, UiServer
from .store import Store, UNSPECIFIED
from .window import Shell, report

from . import __version__ as VERSION
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_ROOT = os.path.join(HERE, "web")


def _require_link(fn):
    """Turn a dead-KiCad LinkError into a typed RPC error, not a traceback."""

    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except LinkError as exc:
            raise RpcError(str(exc), kind="nolink") from exc
        except BoardEditError as exc:
            raise RpcError(str(exc), kind="boardedit") from exc

    return wrapper


class Application:
    def __init__(self, verbose: bool = False) -> None:
        self.link = KiCadLink()
        settings_dir = self.link.settings_dir()
        self.store = Store(settings_dir)
        self.api = Api()
        self.server = UiServer(WEB_ROOT, self.api, version=VERSION, verbose=verbose)
        self.shell: Optional[Shell] = None
        self._quit = threading.Event()
        self._register()

    # ------------------------------------------------------------------ boot

    def start(self, force_browser: bool = False) -> None:
        url = self.server.start()
        self.server.wait_until_ready()
        self.shell = Shell(url, on_close=self._quit.set)
        mode = self.shell.open(force_browser=force_browser)
        report(url, mode)
        try:
            self.shell.run()
        except KeyboardInterrupt:
            pass
        finally:
            self.server.stop()

    # -------------------------------------------------------------- methods

    def _register(self) -> None:
        api = self.api
        # Two HTTP requests must not replace the same recorded IDs concurrently.
        placement_lock = threading.Lock()

        # ---- status -------------------------------------------------------

        @api.method("app.info")
        def _info(_params: Dict[str, Any]) -> Dict[str, Any]:
            return {
                "version": VERSION,
                "methods": api.names(),
                "storeDir": self.store.dir,
                "webRoot": WEB_ROOT,
                "python": sys.version.split()[0],
            }

        @api.method("app.quit")
        def _quit_method(_params: Dict[str, Any]) -> Dict[str, Any]:
            # Give the response a moment to reach the page before the socket
            # goes away, otherwise the UI reports a network error on the way out.
            threading.Timer(0.25, self._shutdown).start()
            return {"quitting": True}

        @api.method("kicad.status")
        def _status(_params: Dict[str, Any]) -> Dict[str, Any]:
            return self.link.state().as_dict()

        @api.method("kicad.reconnect")
        def _reconnect(_params: Dict[str, Any]) -> Dict[str, Any]:
            self.link.invalidate()
            return self.link.state().as_dict()

        # ---- board --------------------------------------------------------

        def live_placements(records):
            if not records:
                return []
            board_ids = self.link.placement_item_ids()
            return [live for record in records
                    if (live := self.store.live_revision(record, board_ids))]

        def placement_ids(design_id, board):
            record = self.store.get_placement(design_id, board)
            revisions = live_placements([record]) if record else []
            return revisions[0]["ids"] if revisions else []

        def reviewed_snapshot(design_id):
            result = self.link.board_snapshot()
            excluded = placement_ids(design_id, result["name"])
            identity = json.dumps([result["name"], sorted(excluded), result.get("nets")])
            digest = hashlib.sha256(identity.encode("utf-8"))
            digest.update(result["text"].encode("utf-8"))
            return {**result, "excludedIds": excluded, "revision": digest.hexdigest()}

        @api.method("board.snapshot")
        @_require_link
        def _snapshot(params: Dict[str, Any]) -> Dict[str, Any]:
            with placement_lock:
                return reviewed_snapshot(str(params.get("designId") or ""))

        @api.method("board.context")
        @_require_link
        def _context(_params: Dict[str, Any]) -> Dict[str, Any]:
            ctx = self.link.board_context()
            board = ctx.get("name") or ""
            placements = live_placements(self.store.placements_for_board(board))
            ctx["placements"] = [
                {
                    "designId": p["designId"],
                    "count": len(p.get("ids", [])),
                    "placed": p.get("placed"),
                    "meta": p.get("meta", {}),
                }
                for p in placements
            ]
            selected = set(ctx.get("selectionIds") or [])
            hits = [(len(selected.intersection(p["ids"])), p["designId"]) for p in placements] if selected else []
            count, design = max(hits, default=(0, None))
            ctx["selectedDesign"] = design if count else None
            # The id list is only useful to us; sending thousands of UUIDs to
            # the page on every poll is pure weight.
            ctx.pop("selectionIds", None)
            return ctx

        @api.method("board.place")
        @_require_link
        def _place(params: Dict[str, Any]) -> Dict[str, Any]:
            payload = params.get("placement") or {}
            placement = Placement.from_payload(payload)
            if placement.item_count() == 0:
                raise RpcError("nothing to place", kind="empty")

            design_id = placement.design_id or f"anon-{int(time.time())}"
            with placement_lock:
                expected = params.get("expectedSnapshot")
                if expected is not None:
                    snapshot = reviewed_snapshot(design_id)
                    if expected != snapshot["revision"]:
                        raise RpcError("The board or previous placement changed. Review the updated destination.",
                                       kind="stale-board")
                    board = snapshot["name"]
                    ids = snapshot["excludedIds"] if params.get("replace") else []
                else:
                    board = str(self.link.board_context().get("name") or "")
                    ids = placement_ids(design_id, board) if params.get("replace") else []

                def remember(created):
                    meta = {
                        "name": placement.name,
                        "kind": params.get("kind", ""),
                        "summary": params.get("summary", ""),
                    }
                    self.store.record_placement(design_id, board, created, meta)

                result = self.link.place(
                    placement, net_name=params.get("net"), replace_ids=ids, remember=remember,
                )
                if params.get("select"):
                    self.link.select(result["ids"])
                if params.get("refill"):
                    self.link.refill_zones()
            result["designId"] = design_id
            return result

        @api.method("board.unplace")
        @_require_link
        def _unplace(params: Dict[str, Any]) -> Dict[str, Any]:
            design_id = str(params.get("designId") or "")
            with placement_lock:
                board = str(self.link.board_context().get("name") or "")
                # KiCad Undo can restore these IDs after an unplace.
                return self.link.remove_ids(placement_ids(design_id, board))

        @api.method("board.select")
        @_require_link
        def _select(params: Dict[str, Any]) -> Dict[str, Any]:
            design_id = str(params.get("designId") or "")
            board = str(self.link.board_context().get("name") or "")
            ids = placement_ids(design_id, board)
            self.link.select(ids)
            return {"selected": len(ids)}

        # ---- footprint library --------------------------------------------

        @api.method("library.write")
        def _library_write(params: Dict[str, Any]) -> Dict[str, Any]:
            name = str(params.get("name") or "coil")
            text = str(params.get("text") or "")
            if not text.strip():
                raise RpcError("empty footprint", kind="empty")
            target = params.get("dir") or self.link.project_dir()
            if not target:
                raise RpcError(
                    "No project directory is available -- save the board in KiCad first, "
                    "or use Download instead.",
                    kind="noproject",
                )
            try:
                path = library.write_footprint(target, name, text)
            except (OSError, ValueError) as exc:
                raise RpcError(f"could not write footprint: {exc}", kind="io") from exc
            changed, message = library.ensure_registered(target)
            return {"path": path, "registered": changed, "message": message}

        @api.method("library.list")
        def _library_list(_params: Dict[str, Any]) -> Dict[str, Any]:
            target = self.link.project_dir()
            return {"dir": target, "footprints": library.list_footprints(target or "")}

        # ---- file output ---------------------------------------------------

        @api.method("file.save")
        def _file_save(params: Dict[str, Any]) -> Dict[str, Any]:
            """Write an export next to the project, or into the store dir.

            A local page cannot open a native save dialog, and a Blob download
            lands wherever the browser decides. Putting the file beside the
            board is nearly always what was wanted, and the response says
            exactly where it went so the user is never left hunting.
            """
            name = os.path.basename(str(params.get("name") or "export.txt"))
            text = params.get("text")
            binary = None
            if "base64" in params:
                import base64
                import binascii
                try:
                    binary = base64.b64decode(params["base64"], validate=True)
                except (ValueError, TypeError, binascii.Error) as exc:
                    raise RpcError("invalid binary export", kind="invalid") from exc
            if binary is None and not isinstance(text, str):
                raise RpcError("nothing to save", kind="empty")
            base = self.link.project_dir() or os.path.join(self.store.dir, "exports")
            outdir = os.path.join(base, "planar-studio-exports") if self.link.project_dir() else base
            try:
                os.makedirs(outdir, exist_ok=True)
                path = os.path.join(outdir, name)
                if binary is not None:
                    with open(path, "wb") as fh:
                        fh.write(binary)
                else:
                    with open(path, "w", encoding="utf-8", newline="\n") as fh:
                        fh.write(text)
            except OSError as exc:
                raise RpcError(f"could not write {name}: {exc}", kind="io") from exc
            return {"path": path, "bytes": len(binary) if binary is not None else len(text.encode("utf-8"))}

        # ---- persistence ---------------------------------------------------

        @api.method("prefs.get")
        def _prefs_get(_params: Dict[str, Any]) -> Dict[str, Any]:
            return self.store.get_prefs()

        @api.method("prefs.set")
        def _prefs_set(params: Dict[str, Any]) -> Dict[str, Any]:
            return self.store.set_prefs(params.get("prefs") or {})

        @api.method("designs.list")
        def _designs_list(_params: Dict[str, Any]) -> Dict[str, Any]:
            return {"designs": self.store.list_designs()}

        @api.method("designs.save")
        def _designs_save(params: Dict[str, Any]) -> Dict[str, Any]:
            design_id = str(params.get("id") or "")
            if not design_id:
                raise RpcError("a design needs an id", kind="badparam")
            revision = self.store.save_design(
                design_id,
                str(params.get("name") or design_id),
                str(params.get("kind") or ""),
                params.get("config") or {},
                params.get("expectedRevision", UNSPECIFIED),
            )
            return {"saved": design_id, "revision": revision}

        @api.method("designs.load")
        def _designs_load(params: Dict[str, Any]) -> Dict[str, Any]:
            entry = self.store.load_design(str(params.get("id") or ""))
            if entry is None:
                raise RpcError("no such design", kind="notfound")
            return entry

        @api.method("designs.delete")
        def _designs_delete(params: Dict[str, Any]) -> Dict[str, Any]:
            return {"deleted": self.store.delete_design(str(params.get("id") or ""),
                                                       params.get("expectedRevision", UNSPECIFIED))}

    # ------------------------------------------------------------- shutdown

    def _shutdown(self) -> None:
        if self.shell is not None:
            self.shell.close()
        self.server.stop()
        self._quit.set()


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    verbose = "--verbose" in argv or bool(os.environ.get("PLANAR_STUDIO_DEBUG"))
    force_browser = "--browser" in argv or bool(os.environ.get("PLANAR_STUDIO_BROWSER"))

    app = Application(verbose=verbose)

    if "--print-url" in argv:
        url = app.server.start()
        app.server.wait_until_ready()
        print(url, flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            app.server.stop()
        return 0

    app.start(force_browser=force_browser)
    return 0
