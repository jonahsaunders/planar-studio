#!/usr/bin/env python3
"""Check this plugin's PCM archive layout and referenced runtime files.

This is a packaging preflight, not a replacement for KiCad's JSON schemas:
https://dev-docs.kicad.org/en/addons/index.html
"""
import argparse
import json
import re
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile


def check_package(path):
    with ZipFile(path) as archive:
        names = archive.namelist()
        files = {item.filename for item in archive.infolist() if not item.is_dir()}
        if "metadata.json" not in files:
            raise ValueError("metadata.json must be at the ZIP root; select the built PCM ZIP, "
                             "not a source archive or a wrapper containing another ZIP")
        if len(names) != len(set(names)):
            raise ValueError("duplicate archive entries")
        for name in names:
            parts = PurePosixPath(name).parts
            if (not parts or name.startswith("/") or "\\" in name or ".." in parts
                    or parts[0] not in {"metadata.json", "plugins", "resources"}):
                raise ValueError(f"unexpected archive entry: {name}")
        damaged = archive.testzip()
        if damaged:
            raise ValueError(f"ZIP integrity check failed: {damaged}")

        def read_object(name):
            if name not in files:
                raise ValueError(f"missing required file: {name}")
            value = json.loads(archive.read(name))
            if not isinstance(value, dict):
                raise ValueError(f"{name} must contain a JSON object")
            return value

        metadata = read_object("metadata.json")
        manifest = read_object("plugins/plugin.json")
        for field in ("name", "description", "description_full", "identifier", "type",
                      "author", "license", "resources", "versions"):
            if field not in metadata:
                raise ValueError(f"metadata.json is missing {field}")
        if metadata["type"] != "plugin":
            raise ValueError("PCM package type must be plugin")
        if not metadata["identifier"] or metadata["identifier"] != manifest.get("identifier"):
            raise ValueError("PCM and IPC plugin identifiers must match")
        versions = metadata["versions"]
        if not isinstance(versions, list) or len(versions) != 1:
            raise ValueError("installer metadata must describe exactly one version")
        version = versions[0]
        if not re.fullmatch(r"\d{1,4}(\.\d{1,4}(\.\d{1,6})?)?", version.get("version", "")):
            raise ValueError("invalid PCM package version")
        if version.get("runtime") != "ipc":
            raise ValueError("PCM version must declare runtime ipc")
        if version.get("status") not in {"stable", "testing", "development", "deprecated"}:
            raise ValueError("invalid PCM version status")
        minimum = tuple(int(part) for part in version["kicad_version"].split("."))
        if minimum < (9, 0, 1):
            raise ValueError("IPC packages require KiCad 9.0.1 or newer for PCM installation")
        if manifest.get("runtime", {}).get("type") != "python":
            raise ValueError("Planar Studio must declare the Python IPC runtime")
        actions = manifest.get("actions")
        if not isinstance(actions, list) or not actions:
            raise ValueError("IPC manifest must declare plugin actions")
        required = {"plugins/requirements.txt", "plugins/planar_studio/app.py",
                    "plugins/web/index.html", "resources/icon.png"}
        for action in actions:
            refs = [action["entrypoint"]]
            for key in ("icons-light", "icons-dark"):
                refs.extend(action.get(key, []))
            for ref in refs:
                relative = PurePosixPath(ref)
                if relative.is_absolute() or ".." in relative.parts or "\\" in ref:
                    raise ValueError(f"invalid plugin resource path: {ref}")
                required.add(f"plugins/{ref}")
        missing = required - files
        if missing:
            raise ValueError(f"missing runtime files: {', '.join(sorted(missing))}")
        return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive")
    args = parser.parse_args()
    try:
        package = check_package(args.archive)
    except (ValueError, KeyError, TypeError, OSError, BadZipFile) as error:
        parser.exit(1, f"Invalid PCM package: {error}\n")
    print(f"PCM layout and manifests verified: {package['name']}")
