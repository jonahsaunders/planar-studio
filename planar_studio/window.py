"""Getting the UI in front of the user.

Preference order is a native window, then the default browser. The native
window is worth trying first because it reads as part of KiCad rather than as a
web page that happens to be about PCBs -- no address bar, no bookmarks, closes
with the tool. But the webview runtimes are the least portable thing in the
whole plugin (Edge WebView2 on Windows, WKWebView on macOS, WebKitGTK plus
PyGObject on Linux, and pip cannot install that last one), so the browser path
is a first-class fallback rather than an error case.

`run` blocks for the lifetime of the window, because pywebview insists on the
main thread. In browser mode there is nothing to block on, so the caller is
handed a wait function instead.
"""

from __future__ import annotations

import os
import sys
import threading
import webbrowser
from typing import Callable, Optional, Tuple

WINDOW_TITLE = "Planar Studio"


def probe_webview() -> Tuple[bool, str]:
    """Can we open a native window here? Returns (yes, reason-if-not)."""
    if os.environ.get("PLANAR_STUDIO_BROWSER"):
        return False, "PLANAR_STUDIO_BROWSER is set"
    try:
        import webview  # type: ignore # noqa: F401
    except Exception as exc:
        return False, f"pywebview unavailable ({type(exc).__name__}: {exc})"
    try:
        # Importing is not enough on Linux: the GUI backend resolves lazily and
        # fails at create_window time, which would be after we have already
        # told the user a window is coming.
        import webview.guilib  # type: ignore

        webview.guilib.initialize()
    except Exception as exc:
        return False, f"no webview backend ({type(exc).__name__}: {exc})"
    return True, ""


class Shell:
    """The window, however it ends up being shown."""

    def __init__(self, url: str, on_close: Optional[Callable[[], None]] = None) -> None:
        self.url = url
        self.on_close = on_close
        self.mode = "none"
        self._closed = threading.Event()

    # -------------------------------------------------------------- lifecycle

    def open(self, force_browser: bool = False) -> str:
        ok, _reason = (False, "forced") if force_browser else probe_webview()
        self.mode = "window" if ok else "browser"
        if self.mode == "browser":
            webbrowser.open(self.url)
        return self.mode

    def run(self) -> None:
        """Block until the user closes the UI."""
        if self.mode == "window":
            self._run_window()
        else:
            self._closed.wait()
        if self.on_close:
            self.on_close()

    def close(self) -> None:
        self._closed.set()

    # ---------------------------------------------------------------- window

    def _run_window(self) -> None:
        import webview  # type: ignore

        window = webview.create_window(
            WINDOW_TITLE,
            self.url,
            width=1480,
            height=940,
            min_size=(1080, 700),
            background_color="#0F1216",
            text_select=False,
            confirm_close=False,
        )

        def _on_closed() -> None:
            self._closed.set()

        try:
            window.events.closed += _on_closed
        except Exception:
            pass

        kwargs = {"debug": bool(os.environ.get("PLANAR_STUDIO_DEBUG"))}
        # private_mode=False keeps localStorage between sessions, which is how
        # the UI remembers your last design without touching the board.
        try:
            webview.start(private_mode=False, **kwargs)
        except TypeError:
            webview.start(**kwargs)
        self._closed.set()


def report(url: str, mode: str) -> None:
    """Say where the UI went. KiCad shows plugin stdout in its console."""
    if mode == "window":
        print(f"[planar-studio] window open ({url})", file=sys.stderr)
    else:
        print(f"[planar-studio] opened in your browser: {url}", file=sys.stderr)
        print(
            "[planar-studio] leave this plugin running while you work; "
            "closing the tab stops nothing, use Quit in the app.",
            file=sys.stderr,
        )
