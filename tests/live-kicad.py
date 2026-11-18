"""Launch the packaged plugin against disposable boards in a real PCB Editor."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen
from zipfile import ZipFile

from kipy import KiCad


ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def running(args, env, **kwargs):
    process = subprocess.Popen(args, env=env, **kwargs)
    try:
        yield process
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)


def await_result(fn, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return fn()
        except Exception as exc:
            error = exc
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for KiCad: {error}") from error


def wait_for_board(path, major, socket_dir, process):
    sockets = [socket_dir / f"api-{process.pid}.sock", socket_dir / "api.sock"]

    def connect():
        assert process.poll() is None, f"PCB Editor exited with status {process.returncode}"
        socket = next((f"ipc://{candidate}" for candidate in sockets if candidate.exists()), None)
        if socket is None and os.name == "nt":
            socket = f"ipc://{sockets[-1]}"
        assert socket, f"No IPC socket appeared in {socket_dir}"
        editor = KiCad(client_name="Planar Studio installer test", timeout_ms=1500, socket_path=socket)
        board = editor.get_board()
        assert Path(board.name).name == path.name, f"Unexpected open document: {board.name}"
        assert editor.get_version().major == major
        return editor, board, socket

    try:
        return await_result(connect)
    except RuntimeError:
        if os.environ.get("DISPLAY") and shutil.which("xwininfo"):
            subprocess.run(["xwininfo", "-root", "-tree"], check=False, timeout=5)
        raise


def plugin_rpc(process):
    lines = queue.Queue()
    threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
    endpoint = urlsplit(lines.get(timeout=25).strip())
    assert endpoint.scheme == "http" and endpoint.hostname in ("127.0.0.1", "localhost")
    token = parse_qs(endpoint.query)["t"][0]
    address = f"{endpoint.scheme}://{endpoint.netloc}"
    with urlopen(address + "/?" + endpoint.query, timeout=10) as page:
        assert b"Planar Studio" in page.read()

    def rpc(method, params=None, error=None):
        request = Request(address + "/api", data=json.dumps({"method": method, "params": params or {}}).encode(),
                          headers={"Content-Type": "application/json", "X-Planar-Token": token})
        with urlopen(request, timeout=115 if method == "board.drc" else 20) as response:
            payload = json.load(response)
        if error:
            assert not payload["ok"] and payload["kind"] == error, payload
            return
        assert payload["ok"], payload
        return payload["result"]

    return rpc


def check_placement(editor, board, rpc):
    def contents():
        return {item.id.value for read in (board.get_tracks, board.get_vias, board.get_text) for item in read()}

    def place(name, x, layer="F.Cu", error=None):
        snapshot = rpc("board.snapshot", {"designId": name})
        return rpc("board.place", {"replace": True, "expectedSnapshot": snapshot["revision"], "placement": {
            "name": name, "designId": name, "tracks": [{"layer": layer, "pts": [[x, 5], [x, 10]]}],
            "vias": [{"x": x, "y": 10}], "texts": [{"x": x, "y": 12, "value": name}],
        }}, error=error)

    context = rpc("board.context")
    assert [layer["name"] for layer in context["copperLayers"]] == ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]
    assert Path(context["boardId"]).is_absolute() and Path(context["boardId"]).name == board.name
    assert not contents()
    snapshot = rpc("board.snapshot", {"designId": "Preview"})
    preview = {"designId": "Preview", "name": "Preview", "tracks": [
        {"layer": "F.Cu", "pts": [[-2, 5], [-2, 10]], "net": None},
    ]}
    rpc("board.drc", {"expectedSnapshot": "old", "placement": preview}, error="stale-board")
    comparison = rpc("board.drc", {"expectedSnapshot": snapshot["revision"], "placement": preview})
    assert comparison["newCount"] > 0 and comparison["rulesRevision"], comparison
    assert not contents()
    rules = Path(context["boardId"]).with_suffix(".kicad_dru")
    rules.write_text("(version 1)\n", encoding="utf-8")
    rpc("board.place", {"expectedSnapshot": snapshot["revision"], "expectedRules": comparison["rulesRevision"],
                       "placement": preview}, error="stale-board")
    assert not contents()
    place("Absent layer", 5, layer="In3.Cu", error="boardedit")
    assert not contents()
    untouched = set(place("Other", 5)["ids"])
    original = set(place("Coil", 10)["ids"])
    replacement = place("Coil", 15)
    new = set(replacement["ids"])
    assert replacement["replaced"] == 3 and contents() == untouched | new

    def visible(ids):
        assert contents() == untouched | ids
        assert set(rpc("board.snapshot", {"designId": "Coil"})["excludedIds"]) == ids

    editor.run_action("common.Interactive.undo")
    await_result(lambda: visible(original), timeout=10)
    editor.run_action("common.Interactive.redo")
    await_result(lambda: visible(new), timeout=10)
    print("Packaged plugin placed, replaced, undid and redid copper and labels.", flush=True)


def check_series_placement(board, rpc, payload):
    payload.update(designId="Series stack", name="Series stack")
    snapshot = rpc("board.snapshot", {"designId": payload["designId"]})
    placed = rpc("board.place", {"expectedSnapshot": snapshot["revision"], "placement": payload})
    ids = set(placed["ids"])
    tracks = [item for item in board.get_tracks() if item.id.value in ids]
    vias = [item for item in board.get_vias() if item.id.value in ids]
    assert len(tracks) == sum(len(track["pts"]) - 1 for track in payload["tracks"])
    assert len(vias) == 5
    assert len({track.layer for track in tracks}) == 4
    print("Packaged plugin placed the four-layer series spiral and its five isolated barrels.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("--pcbnew", default="pcbnew")
    parser.add_argument("--major", type=int, required=True)
    parser.add_argument("--scratch", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="planar-kicad-", dir=args.scratch, ignore_cleanup_errors=True) as tmp:
        root = Path(tmp).resolve()
        config = root / "config" / f"{args.major}.0"
        config.mkdir(parents=True)
        (config / "kicad_common.json").write_text(json.dumps({
            "api": {"enable_server": True, "interpreter_path": sys.executable},
            "do_not_show_again": {"data_collection_prompt": True, "update_check_prompt": True},
            "graphics": {"canvas_type": 2},
        }))
        (config / "kicad.json").write_text('{"system":{"first_run_shown":true}}')
        (config / "pcbnew.json").write_text("{}")
        (config / "fp-lib-table").write_text("(fp_lib_table (version 7))")
        (config / "sym-lib-table").write_text("(sym_lib_table (version 7))")
        (config / "design-block-lib-table").write_text("(design_block_lib_table (version 7))")
        temp = root / "tmp"
        temp.mkdir()
        socket_dir = (Path("/tmp") if sys.platform == "darwin" else temp) / "kicad"
        env = {**os.environ, "KICAD_CONFIG_HOME": str(config.parent), "TMP": str(temp), "TEMP": str(temp), "TMPDIR": str(temp),
               "KICAD_DOCUMENTS_HOME": str(root / "documents"), "KICAD_CACHE_HOME": str(root / "cache"),
               "PLANAR_STUDIO_HOME": str(root / "store"), "LIBGL_ALWAYS_SOFTWARE": "1"}
        env.pop("KICAD_API_TOKEN", None)
        env.pop("KICAD_API_SOCKET", None)
        with ZipFile(args.installer) as installer:
            installer.extractall(root / "installer")
        entry = root / "installer" / "plugins" / "ipc_entry.py"
        fixture = root / f"placement-{root.name}.kicad_pcb"
        exported = root / f"export-{root.name}.kicad_pcb"
        filter_fixture = root / f"filter-{root.name}.kicad_pcb"
        series_fixture = root / f"series-{root.name}.kicad_pcb"
        series_payload = root / "series-placement.json"
        inset_fixture = root / f"inset-{root.name}.kicad_pcb"
        subprocess.run(["node", str(ROOT / "tests" / "live-board-fixtures.mjs"),
                        str(fixture), str(exported), str(filter_fixture), str(series_fixture), str(series_payload),
                        str(inset_fixture)],
                       check=True, cwd=ROOT)
        with running([args.pcbnew, str(fixture)], env) as process:
            editor, board, socket = wait_for_board(fixture, args.major, socket_dir, process)
            with running([sys.executable, str(entry), "--print-url"], {**env, "KICAD_API_SOCKET": socket},
                         stdout=subprocess.PIPE, text=True) as plugin:
                rpc = plugin_rpc(plugin)
                check_placement(editor, board, rpc)
                check_series_placement(board, rpc, json.loads(series_payload.read_text(encoding="utf-8")))
        with running([args.pcbnew, str(exported)], env) as process:
            _, reopened, _ = wait_for_board(exported, args.major, socket_dir, process)
            assert len(reopened.get_tracks()) > 10, "Exported coil copper missing"
            assert reopened.get_vias(), "Exported coil terminal vias missing"
            print("KiCad reopened the exported board and read its tracks and vias.", flush=True)
        cli_name = "kicad-cli.exe" if os.name == "nt" else "kicad-cli"
        cli = os.environ.get("PLANAR_STUDIO_KICAD_CLI") or shutil.which(cli_name) or str(Path(args.pcbnew).with_name(cli_name))
        for board_file in [filter_fixture, series_fixture, inset_fixture]:
            report_file = board_file.with_suffix(".json")
            check = subprocess.run([cli, "pcb", "drc", "--format", "json", "--severity-error",
                                    "--exit-code-violations", "--output", str(report_file), str(board_file)],
                                   env=env, timeout=50, capture_output=True, text=True)
            assert report_file.is_file(), check.stderr or check.stdout
            report = json.loads(report_file.read_text(encoding="utf-8"))
            assert check.returncode == 0 and not report.get("unconnected_items"), report
            print(f"KiCad found no errors or unrouted connections in {board_file.name}.", flush=True)


if __name__ == "__main__":
    main()
