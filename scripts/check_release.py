"""Validate release notes before building or publishing an installer."""
import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def check_release(root=ROOT):
    package = json.loads((root / "metadata.json").read_text(encoding="utf-8"))["versions"][0]
    notes = root / "docs" / "releases" / f"{package['version']}.md"
    if not notes.is_file():
        raise ValueError(f"Missing release notes: docs/releases/{package['version']}.md")
    if not notes.read_text(encoding="utf-8").strip():
        raise ValueError(f"Empty release notes: docs/releases/{package['version']}.md")
    return package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--github-output", type=Path,
                        help="Append the validated version and status to a workflow output file")
    args = parser.parse_args()
    try:
        package = check_release()
        if args.github_output:
            with args.github_output.open("a", encoding="utf-8") as output:
                output.write(f"version={package['version']}\nstatus={package['status']}\n")
    except (ValueError, KeyError, IndexError, TypeError, OSError) as error:
        parser.exit(1, f"Invalid release: {error}\n")
    print(f"Release notes verified: {package['version']}")


if __name__ == "__main__":
    main()
