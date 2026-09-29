"""Build a PCM archive without shell utilities or deleting a staging directory.

Usage: python scripts/build_package.py [--output PATH]
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent


def main():
    version = json.loads((ROOT / "metadata.json").read_text())["versions"][0]["version"]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / f"planar-studio-{version}.zip")
    output = parser.parse_args().output.resolve()
    files = [(ROOT / "metadata.json", "metadata.json"), (ROOT / "resources/icon.png", "resources/icon.png")]
    for name in ["plugin.json", "requirements.txt", "ipc_entry.py", "LICENSE", "README.md"]:
        files.append((ROOT / name, "plugins/" + name))
    for directory in ["planar_studio", "web", "docs"]:
        files.extend((p, "plugins/" + p.relative_to(ROOT).as_posix()) for p in (ROOT / directory).rglob("*")
                     if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc" and p.name != ".DS_Store")
    for name in ["icon-light-24.png", "icon-dark-24.png"]:
        files.append((ROOT / "resources" / name, "plugins/resources/" + name))
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for source, destination in sorted(files, key=lambda pair: pair[1]):
            archive.write(source, destination)
    subprocess.run([sys.executable, str(ROOT / "scripts/check_pcm.py"), str(output)], check=True)
    print(f"Built {output}\nSHA256 {hashlib.sha256(output.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
