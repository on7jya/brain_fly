#!/usr/bin/env python3
"""Serve the MaleCNS Tetris UI from this folder. Stdlib only."""

from __future__ import annotations

import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
PROC = ROOT / "data" / "processed"

DATASETS = {
    "male-cns": "circuit_malecns.json",
    "malecns": "circuit_malecns.json",
    "mcns": "circuit_malecns.json",
    "fafb": "circuit_fafb.json",
    "banc": "circuit_banc.json",
    "manc": "circuit_manc.json",
    "maol": "circuit_maol.json",
}


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

    def _circuit_path(self, dataset: str | None) -> Path:
        key = (dataset or "male-cns").lower()
        name = DATASETS.get(key, "circuit_malecns.json")
        path = PROC / name
        if path.exists():
            return path
        fallback = PROC / "circuit.json"
        return fallback

    def _api(self) -> bytes | None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/circuit":
            ds = (qs.get("dataset") or ["male-cns"])[0]
            circuit = self._circuit_path(ds)
            return circuit.read_bytes() if circuit.exists() else b"{}"

        if path == "/api/datasets":
            available = []
            for key, fname in [
                ("male-cns", "circuit_malecns.json"),
                ("fafb", "circuit_fafb.json"),
                ("banc", "circuit_banc.json"),
                ("manc", "circuit_manc.json"),
                ("maol", "circuit_maol.json"),
            ]:
                p = PROC / fname
                meta = {"id": key, "file": fname, "available": p.exists()}
                if p.exists():
                    try:
                        src = json.loads(p.read_text()).get("source") or {}
                        meta["name"] = src.get("name")
                        meta["sex"] = src.get("sex")
                        meta["scaffold"] = bool(src.get("scaffold"))
                        meta["limitation"] = src.get("limitation") or src.get("auth_blocker")
                    except Exception:
                        pass
                available.append(meta)
            return json.dumps({"datasets": available}).encode()

        if path == "/api/compare":
            p = PROC / "compare_fafb_mcns.json"
            return p.read_bytes() if p.exists() else b'{"rows":[]}'

        if path == "/api/pathways":
            p = PROC / "pathways.json"
            return p.read_bytes() if p.exists() else b'{"items":[]}'

        if path == "/api/nt":
            p = PROC / "nt_palette.json"
            return p.read_bytes() if p.exists() else b"{}"

        if path == "/api/source":
            ds = (qs.get("dataset") or ["male-cns"])[0]
            circuit = self._circuit_path(ds)
            src = {}
            if circuit.exists():
                try:
                    src = json.loads(circuit.read_text()).get("source") or {}
                except Exception:
                    pass
            return json.dumps(
                {
                    "blog": src.get(
                        "blog",
                        "https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/",
                    ),
                    "dataset": src.get("dataset", ds),
                    "codex": src.get("codex", f"https://codex.flywire.ai/?dataset={ds}"),
                    "source": src,
                }
            ).encode()

        return None

    def _route_path(self) -> bytes | None:
        """Rewrite static aliases. Return API body for /api/*, else None."""
        path = self.path.split("?", 1)[0]
        if path in {"/", "/index.html"}:
            self.path = "/web/index.html"
            return None
        if path in self._ONBOARDING:
            self.path = "/web/about.html"
            return None
        if path.startswith("/web/") or path.startswith("/data/"):
            return None
        if path.startswith("/api/"):
            return self._api()
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
