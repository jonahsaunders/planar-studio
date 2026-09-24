"""Optional, local KiCad CLI fabrication checks. No shell or caller-supplied paths.

CLI switches follow https://docs.kicad.org/9.0/en/cli/cli.html . A missing
executable or missing/invalid DRC report is never reported as a successful DRC.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from typing import Any, Dict
import zipfile

MAX_BOARD_BYTES = 32_000_000
MAX_PACKAGE_BYTES = 32_000_000
TIMEOUT_SECONDS = 120


def _execute(args: list[str], cwd: Path) -> Dict[str, Any]:
    env = os.environ.copy()
    env.update({"KICAD_CONFIG_HOME": str(cwd / "settings"), "KICAD_CACHE_HOME": str(cwd / "cache"),
                "KICAD_DOCUMENTS_HOME": str(cwd / "documents")})
    try:
        result = subprocess.run(args, cwd=str(cwd), capture_output=True, text=True,
                                timeout=TIMEOUT_SECONDS, shell=False, check=False, env=env)
        return {"exitCode": result.returncode, "stdout": result.stdout[-12000:], "stderr": result.stderr[-12000:]}
    except subprocess.TimeoutExpired:
        return {"exitCode": None, "error": f"KiCad CLI exceeded the {TIMEOUT_SECONDS}-second time limit.", "status": "timeout"}
    except OSError as exc:
        return {"exitCode": None, "error": str(exc), "status": "failed"}


def run_manufacturing(store_dir: str, params: Dict[str, Any]) -> Dict[str, Any]:
    text = params.get("boardText")
    filename = params.get("filename") or "pcb-litz.kicad_pcb"
    if not isinstance(text, str) or not text.lstrip().startswith("(kicad_pcb") or len(text.encode("utf-8")) > MAX_BOARD_BYTES:
        raise ValueError("Provide a .kicad_pcb board text no larger than 32 MB.")
    if not isinstance(filename, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.kicad_pcb", filename):
        raise ValueError("Use a simple .kicad_pcb filename containing letters, numbers, underscores, dots, or hyphens.")
    store_root = Path(store_dir).resolve()
    root = store_root / "manufacturing"
    root.mkdir(parents=True, exist_ok=True)
    if not root.resolve().is_relative_to(store_root):
        raise ValueError("Manufacturing output must remain within the application store.")
    stage = Path(tempfile.mkdtemp(prefix="litz-", dir=str(root))).resolve()
    if not stage.is_relative_to(root.resolve()):
        raise ValueError("Invalid manufacturing staging directory.")
    board = stage / filename
    board.write_text(text, encoding="utf-8")
    # The winding explicitly requires this process. Enable that via category
    # without relaxing DRC severities, clearances, drill or annular-ring rules.
    project = {"meta": {"filename": board.with_suffix(".kicad_pro").name, "version": 1},
               "board": {"design_settings": {"rules": {"allow_blind_buried_vias": True}}}}
    board.with_suffix(".kicad_pro").write_text(json.dumps(project, indent=2), encoding="utf-8")
    executable = shutil.which("kicad-cli")
    result: Dict[str, Any] = {"available": bool(executable), "ok": False, "status": "unavailable", "checks": {}, "files": [], "stage": str(stage)}
    if not executable:
        result["message"] = "kicad-cli is not installed or not on PATH. Native DRC and fabrication generation were not run."
    else:
        version = _execute([executable, "--version"], stage)
        result["version"] = version.get("stdout", "").strip()
        if version.get("exitCode") != 0:
            result.update(status="failed", message="KiCad CLI could not start.")
            result["checks"]["version"] = version
        elif not params.get("runDrc", True):
            result.update(status="not-run", message="Native DRC was not requested. Fabrication generation requires a successful DRC.")
        else:
            report = stage / "drc.json"
            drc = _execute([executable, "pcb", "drc", "--format", "json", "--severity-all", "--exit-code-violations", "--output", str(report), str(board)], stage)
            drc["ok"] = False
            try:
                data = json.loads(report.read_text(encoding="utf-8"))
                # These three arrays are defined by KiCad's JSON DRC writer.
                fields = ("violations", "unconnected_items", "schematic_parity")
                if not isinstance(data, dict) or not isinstance(data.get("violations"), list):
                    raise ValueError("DRC report does not contain the expected violation list")
                counts = {key: len(data.get(key, [])) for key in fields if isinstance(data.get(key, []), list)}
                if len(counts) != len(fields):
                    raise ValueError("DRC report contains invalid item lists")
                drc["counts"] = counts
                drc["ok"] = drc.get("exitCode") == 0 and not any(counts.values())
                drc["status"] = "passed" if drc["ok"] else "violations" if drc.get("exitCode") in (0, 5) else "failed"
            except (OSError, ValueError, TypeError) as exc:
                drc["error"] = f"Native DRC report unavailable or invalid: {exc}"
                drc.setdefault("status", "failed")
            result["checks"]["drc"] = drc
            result.update(ok=drc["ok"], status=drc["status"], message="Native KiCad DRC passed." if drc["ok"] else "Native KiCad DRC did not pass; fabrication generation is blocked.")
            if drc["ok"] and params.get("generate", True):
                output = stage / "fabrication"
                output.mkdir()
                commands = {
                    "gerbers": [executable, "pcb", "export", "gerbers", "--no-protel-ext", "--layers", "F.Cu,In1.Cu,In2.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts", "--output", str(output), str(board)],
                    "drill": [executable, "pcb", "export", "drill", "--format", "excellon", "--excellon-separate-th", "--output", str(output), str(board)],
                }
                for name, command in commands.items():
                    check = _execute(command, stage)
                    suffix = ".gbr" if name == "gerbers" else ".drl"
                    check["ok"] = check.get("exitCode") == 0 and any(output.glob(f"*{suffix}"))
                    check["status"] = "passed" if check["ok"] else "failed"
                    if not check["ok"]:
                        check.setdefault("error", "Command failed or expected output files were not generated.")
                    result["checks"][name] = check
                result["ok"] = all(check.get("ok", False) for check in result["checks"].values())
                result["status"] = "generated" if result["ok"] else "failed"
                result["message"] = "Native DRC passed; Gerber and Excellon outputs generated for review." if result["ok"] else "Fabrication export failed. Inspect the native command results."
    (stage / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    (stage / "README.txt").write_text(result["message"] + "\n\nGenerated outputs still require fabricator CAM review and approval of the blind/buried via stack.\n", encoding="utf-8")
    package = stage / "pcb-litz-review.zip"
    members = [p for p in stage.rglob("*") if p.is_file() and not p.is_symlink() and p != package
               and p.relative_to(stage).parts[0] not in ("settings", "cache", "documents")]
    if sum(p.stat().st_size for p in members) > MAX_PACKAGE_BYTES:
        result.update(ok=False, status="too-large", message="Review outputs exceed the 32 MB package limit.")
        return result
    with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in members:
            archive.write(path, arcname=path.relative_to(stage).as_posix())
    result["files"] = [{"name": package.name, "encoding": "base64", "mime": "application/zip", "content": base64.b64encode(package.read_bytes()).decode("ascii")}]
    result["artifacts"] = [p.relative_to(stage).as_posix() for p in members]
    return result
