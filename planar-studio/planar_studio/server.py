"""Local HTTP server: static UI plus a small JSON-RPC surface.

Why a server at all, rather than a wxPython dialog? Because IPC plugins run as
their own process with their own interpreter, which frees the UI from KiCad's
bundled wx build. A local page gets a real layout engine, real canvas
performance and a design language that is not from 2009 -- and the same page
runs unchanged in a native window or a browser tab.

Two things matter for safety here. The socket binds to loopback only, and every
request must carry a per-session token. Without the token any page the user has
open in another tab could POST geometry into their board, since a plain
localhost server is same-origin-adjacent enough for a determined attacker; with
it, the only thing that can drive the board is the window this process opened.
"""

from __future__ import annotations

import json
import mimetypes
import os
import secrets
import socket
import threading
import traceback
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import parse_qs, unquote, urlparse

Handler = Callable[[Dict[str, Any]], Any]


class RpcError(Exception):
    def __init__(self, message: str, kind: str = "error", detail: str = "") -> None:
        super().__init__(message)
        self.kind = kind
        self.detail = detail


class Api:
    """A tiny method registry. Decorate, and it is callable from the page."""

    def __init__(self) -> None:
        self._methods: Dict[str, Handler] = {}

    def method(self, name: str) -> Callable[[Handler], Handler]:
        def register(fn: Handler) -> Handler:
            self._methods[name] = fn
            return fn

        return register

    def call(self, name: str, params: Dict[str, Any]) -> Any:
        fn = self._methods.get(name)
        if fn is None:
            raise RpcError(f"unknown method {name!r}", kind="badmethod")
        return fn(params or {})

    def names(self) -> list:
        return sorted(self._methods)


class _RequestHandler(BaseHTTPRequestHandler):
    server_version = "PlanarStudio/1.0"
    protocol_version = "HTTP/1.1"

    # Silence the default stderr access log; the plugin's stdout is KiCad's.
    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        if self.server.verbose:  # type: ignore[attr-defined]
            print("[planar-studio] " + fmt % args)

    # ------------------------------------------------------------------ auth

    def _token_ok(self) -> bool:
        """Three ways in, all the same secret.

        The header is what the page's own fetches use. The query string is how
        the very first navigation carries it, because the URL is all the shell
        can hand a browser. The cookie is what makes stylesheets and modules
        work at all -- a browser attaches neither a custom header nor a query
        string to a subresource request, so without it every asset on the page
        would be refused.
        """
        expected = self.server.token  # type: ignore[attr-defined]

        got = self.headers.get("X-Planar-Token")
        if got and secrets.compare_digest(got, expected):
            return True

        query = parse_qs(urlparse(self.path).query)
        val = (query.get("t") or [""])[0]
        if val and secrets.compare_digest(val, expected):
            return True

        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie") or "")
        except Exception:
            return False
        morsel = cookie.get("planar_token")
        return bool(morsel) and secrets.compare_digest(morsel.value, expected)

    # ------------------------------------------------------------- responses

    def _send(self, status: int, body: bytes, ctype: str, extra: Optional[Dict[str, str]] = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        # The page loads nothing from the network; say so, so a stray
        # third-party URL in a future edit fails loudly instead of silently
        # phoning home from inside the user's CAD tool.
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data: blob:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; "
            "font-src 'self' data:; base-uri 'none'; form-action 'none'",
        )
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload: Any, close: bool = False) -> None:
        self._send(
            status,
            json.dumps(payload).encode("utf-8"),
            "application/json; charset=utf-8",
            {"Connection": "close"} if close else None,
        )
        if close:
            self.close_connection = True

    def _drain(self, length: int) -> None:
        """Discard an oversized body in bounded chunks."""
        remaining = length
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)

    # --------------------------------------------------------------- routing

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/healthz":
            self._json(200, {"ok": True})
            return

        if not self._token_ok():
            self._json(403, {"ok": False, "error": "bad or missing session token"})
            return

        if path in ("/", "/index.html"):
            self._serve_index()
            return

        self._serve_static(path)

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        """Read the body FIRST, then decide whether to serve the request.

        This ordering is not cosmetic. On a keep-alive connection an unread
        request body stays in the socket buffer, and the next request on that
        connection is parsed starting from the leftover bytes -- so a single
        rejected POST silently corrupts every request after it. Draining before
        the token check costs nothing and removes the whole class of failure.
        """
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length > 64 * 1024 * 1024:
            self._drain(length)
            self._json(413, {"ok": False, "error": "payload too large"}, close=True)
            return
        raw = self.rfile.read(length) if length > 0 else b"{}"

        if not self._token_ok():
            self._json(403, {"ok": False, "error": "bad or missing session token"})
            return
        parsed = urlparse(self.path)
        if unquote(parsed.path) != "/api":
            self._json(404, {"ok": False, "error": "no such endpoint"})
            return
        try:
            request = json.loads(raw.decode("utf-8") or "{}")
        except ValueError as exc:
            self._json(400, {"ok": False, "error": f"malformed JSON: {exc}"})
            return

        method = str(request.get("method") or "")
        params = request.get("params") or {}
        try:
            result = self.server.api.call(method, params)  # type: ignore[attr-defined]
            self._json(200, {"ok": True, "result": result})
        except RpcError as exc:
            self._json(200, {"ok": False, "error": str(exc), "kind": exc.kind, "detail": exc.detail})
        except Exception as exc:  # pragma: no cover - defensive
            self._json(
                200,
                {
                    "ok": False,
                    "error": f"{type(exc).__name__}: {exc}",
                    "kind": "exception",
                    "detail": traceback.format_exc(limit=6),
                },
            )

    # ---------------------------------------------------------------- static

    def _serve_index(self) -> None:
        root = self.server.web_root  # type: ignore[attr-defined]
        try:
            with open(os.path.join(root, "index.html"), "rb") as fh:
                body = fh.read()
        except OSError as exc:
            self._send(500, f"index.html missing: {exc}".encode(), "text/plain; charset=utf-8")
            return
        # Hand the page its own credentials as body attributes rather than an
        # inline script -- the CSP above forbids inline script deliberately, so
        # that a future edit cannot quietly introduce one.
        body = body.replace(b"__PLANAR_TOKEN__", self.server.token.encode())  # type: ignore[attr-defined]
        body = body.replace(b"__PLANAR_VERSION__", str(self.server.app_version).encode())  # type: ignore[attr-defined]
        # Hand the browser a cookie so it can fetch the stylesheet and the
        # modules; a subresource request carries neither header nor query.
        self._send(
            200,
            body,
            "text/html; charset=utf-8",
            {
                "Set-Cookie": (
                    f"planar_token={self.server.token}; Path=/; SameSite=Strict; HttpOnly"  # type: ignore[attr-defined]
                ),
            },
        )

    def _serve_static(self, path: str) -> None:
        root = os.path.realpath(self.server.web_root)  # type: ignore[attr-defined]
        target = os.path.realpath(os.path.join(root, path.lstrip("/")))
        if not (target == root or target.startswith(root + os.sep)):
            self._json(403, {"ok": False, "error": "outside web root"})
            return
        if not os.path.isfile(target):
            self._json(404, {"ok": False, "error": "not found"})
            return
        ctype, _ = mimetypes.guess_type(target)
        if target.endswith(".js"):
            ctype = "text/javascript; charset=utf-8"
        elif target.endswith(".css"):
            ctype = "text/css; charset=utf-8"
        try:
            with open(target, "rb") as fh:
                body = fh.read()
        except OSError as exc:
            self._send(500, str(exc).encode(), "text/plain; charset=utf-8")
            return
        self._send(200, body, ctype or "application/octet-stream")


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr: Tuple[str, int], handler: type, **kw: Any) -> None:
        super().__init__(addr, handler)
        for key, value in kw.items():
            setattr(self, key, value)


class UiServer:
    """Owns the socket and the background thread."""

    def __init__(self, web_root: str, api: Api, version: str = "1.0.0", verbose: bool = False) -> None:
        self.web_root = web_root
        self.api = api
        self.token = secrets.token_urlsafe(32)
        self.version = version
        self.verbose = verbose
        self._httpd: Optional[_Server] = None
        self._thread: Optional[threading.Thread] = None

    @property
    def port(self) -> int:
        return self._httpd.server_address[1] if self._httpd else 0

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/?t={self.token}"

    def start(self, preferred_port: int = 0) -> str:
        addr = ("127.0.0.1", preferred_port)
        try:
            httpd = _Server(
                addr,
                _RequestHandler,
                web_root=self.web_root,
                api=self.api,
                token=self.token,
                app_version=self.version,
                verbose=self.verbose,
            )
        except OSError:
            httpd = _Server(
                ("127.0.0.1", 0),
                _RequestHandler,
                web_root=self.web_root,
                api=self.api,
                token=self.token,
                app_version=self.version,
                verbose=self.verbose,
            )
        self._httpd = httpd
        self._thread = threading.Thread(target=httpd.serve_forever, name="planar-studio-http", daemon=True)
        self._thread.start()
        return self.url

    def stop(self) -> None:
        if self._httpd is not None:
            try:
                self._httpd.shutdown()
                self._httpd.server_close()
            except Exception:
                pass
            self._httpd = None

    def wait_until_ready(self, timeout: float = 5.0) -> bool:
        import time

        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.4):
                    return True
            except OSError:
                time.sleep(0.05)
        return False
