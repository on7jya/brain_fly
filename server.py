#!/usr/bin/env python3
"""Serve the MaleCNS Tetris UI from this folder. Stdlib only."""

from __future__ import annotations

import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    _ONBOARDING = {
        "/about",
        "/about.html",
        "/tour",
        "/tour.html",
        "/onboarding",
        "/onboarding.html",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _route_path(self) -> str | None:
        """Rewrite static aliases. Return API body for /api/*, else None."""
        path = self.path.split("?", 1)[0]
        if path in {"/", "/index.html"}:
            self.path = "/web/index.html"
            return None
        if path in self._ONBOARDING:
            # web/tour.html & web/onboarding.html also symlink to about.html
            self.path = "/web/about.html"
            return None
        if path.startswith("/web/") or path.startswith("/data/"):
            return None
        if path == "/api/circuit":
            circuit = ROOT / "data" / "processed" / "circuit.json"
            return circuit.read_bytes() if circuit.exists() else b"{}"
        if path == "/api/source":
            return json.dumps(
                {
                    "blog": "https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/",
                    "dataset": "male-cns:v1.0",
                }
            ).encode()
        return None

    def _send_api(self, body: bytes, *, write_body: bool) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if write_body:
            self.wfile.write(body)

    def do_GET(self) -> None:
        api = self._route_path()
        if api is not None:
            self._send_api(api, write_body=True)
            return
        return super().do_GET()

    def do_HEAD(self) -> None:
        api = self._route_path()
        if api is not None:
            self._send_api(api, write_body=False)
            return
        return super().do_HEAD()

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT))
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    url = f"http://{args.host}:{args.port}/"
    print(f"MaleCNS Tetris  →  {url}")
    print("Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
