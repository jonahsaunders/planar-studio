#!/usr/bin/env python3
"""KiCad IPC API entry point.

KiCad launches this file in the plugin's own virtual environment, with
KICAD_API_SOCKET and KICAD_API_TOKEN in the environment. It is also runnable
standalone for development:

    python ipc_entry.py --browser --verbose

With no KiCad on the other end the UI still opens and every design, analysis
and export works; only the board actions report that there is nothing to talk
to.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from planar_studio.app import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
