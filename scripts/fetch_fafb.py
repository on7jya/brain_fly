#!/usr/bin/env python3
"""Fetch FAFB (♀ FlyWire) Codex download products — graceful if Google login required.

Patterned after scripts/fetch_mcns.py. Codex FAQ documents:
  https://codex.flywire.ai/api/download?dataset=fafb
  https://codex.flywire.ai/api/download_resource?data_product=...&dataset=fafb

Public bulk CSVs currently require a FlyWire / Google login. This script:
  1) Probes the download portal and resource endpoints
  2) Saves whatever is publicly reachable
  3) Writes data/raw/fafb/STATUS.json documenting blockers
  4) Never crashes the roadmap — exit 0 even when auth-blocked
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "fafb"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

PORTAL = "https://codex.flywire.ai/api/download?dataset=fafb"
PRODUCTS = [
    "consolidated_cell_types",
    "connections_princeton",
    "connections_princeton_no_threshold",
    "classification",
    "neurons",
]


def fetch(url: str, dest: Path | None = None, max_bytes: int | None = None) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        data = resp.read(max_bytes) if max_bytes else resp.read()
        ct = resp.headers.get("content-type", "")
        if dest is not None and max_bytes is None:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        return resp.status, data, ct


def looks_like_login(body: bytes, ct: str) -> bool:
    text = body[:4000].decode("utf-8", "replace").lower()
    if "text/html" in ct and ("sign in" in text or "accounts.google" in text or "login" in text):
        return True
    if b"accounts.google.com" in body[:8000]:
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument(
        "--cookie",
        default="",
        help="Optional Cookie header from a logged-in Codex browser session",
    )
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)

    status: dict = {
        "dataset": "fafb",
        "sex": "female",
        "portal": PORTAL,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "auth_required": False,
        "files": {},
        "note": "",
    }

    headers_extra = {}
    if args.cookie:
        headers_extra["Cookie"] = args.cookie

    print(f"GET {PORTAL}")
    try:
        req = urllib.request.Request(PORTAL, headers={"User-Agent": UA, **headers_extra})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=45) as resp:
            portal_body = resp.read()
            portal_ct = resp.headers.get("content-type", "")
            (RAW / "download_portal.bin").write_bytes(portal_body[:200_000])
            status["files"]["download_portal"] = {
                "ok": True,
                "bytes": len(portal_body),
                "content_type": portal_ct,
            }
            if looks_like_login(portal_body, portal_ct):
                status["auth_required"] = True
                print("  portal looks like login wall")
            else:
                # try parse JSON listing
                try:
                    listing = json.loads(portal_body)
                    (RAW / "download_portal.json").write_text(json.dumps(listing, indent=2)[:500_000])
                    print(f"  portal JSON keys/type: {type(listing).__name__}")
                except json.JSONDecodeError:
                    print(f"  portal non-JSON ({portal_ct}), saved snippet")
    except Exception as exc:
        status["files"]["download_portal"] = {"ok": False, "error": str(exc)}
        print(f"  WARN portal: {exc}", file=sys.stderr)
        if "401" in str(exc) or "403" in str(exc) or "302" in str(exc):
            status["auth_required"] = True

    for product in PRODUCTS:
        url = f"https://codex.flywire.ai/api/download_resource?data_product={product}&dataset=fafb"
        dest = RAW / f"{product}.csv.gz"
        if args.skip_existing and dest.exists() and dest.stat().st_size > 1000:
            print(f"skip {dest.name}")
            status["files"][product] = {"ok": True, "skipped": True, "path": str(dest)}
            continue
        print(f"GET {url}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **headers_extra})
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                data = resp.read(64_000)  # probe first
                ct = resp.headers.get("content-type", "")
                if looks_like_login(data, ct):
                    status["auth_required"] = True
                    status["files"][product] = {
                        "ok": False,
                        "auth_required": True,
                        "content_type": ct,
                    }
                    print(f"  AUTH required for {product}")
                    continue
                # If probe looks like gzip/csv, re-fetch fully
                if data[:2] == b"\x1f\x8b" or b"," in data[:200]:
                    # full download
                    with urllib.request.urlopen(req, context=ctx, timeout=600) as full:
                        blob = full.read()
                    dest.write_bytes(blob)
                    status["files"][product] = {
                        "ok": True,
                        "bytes": len(blob),
                        "path": str(dest),
                    }
                    print(f"  -> {dest} ({len(blob):,} bytes)")
                else:
                    # save probe for debugging
                    probe = RAW / f"{product}.probe.bin"
                    probe.write_bytes(data)
                    status["files"][product] = {
                        "ok": False,
                        "note": "unexpected payload",
                        "content_type": ct,
                        "probe": str(probe),
                    }
                    if looks_like_login(data, ct):
                        status["auth_required"] = True
                    print(f"  unexpected payload for {product} ct={ct}")
        except urllib.error.HTTPError as exc:
            status["files"][product] = {"ok": False, "http": exc.code, "error": str(exc)}
            if exc.code in (401, 403):
                status["auth_required"] = True
            print(f"  HTTP {exc.code} {product}", file=sys.stderr)
        except Exception as exc:
            status["files"][product] = {"ok": False, "error": str(exc)}
            print(f"  WARN {product}: {exc}", file=sys.stderr)

    if status["auth_required"]:
        status["note"] = (
            "Codex FAFB bulk CSV download requires FlyWire / Google login. "
            "Open https://codex.flywire.ai/api/download?dataset=fafb in a browser, "
            "sign in, then re-run with --cookie '...' or place CSVs manually under data/raw/fafb/. "
            "Roadmap continues with scaffolded FAFB circuit + MaleCNS comparison."
        )
    else:
        status["note"] = "FAFB resources fetched or partially available."

    (RAW / "STATUS.json").write_text(json.dumps(status, indent=2))
    print("Wrote", RAW / "STATUS.json")
    print(status["note"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
