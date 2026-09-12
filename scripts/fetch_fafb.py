#!/usr/bin/env python3
"""Fetch FAFB (♀ FlyWire) connectivity for brain_fly.

Preferred path (no Google login): public lee-lab GCS feather tables
  gs://lee-lab_brain-and-nerve-cord-fly-connectome/compiled_data/fafb_783/
converted into Codex-shaped CSVs under data/raw/fafb/:
  consolidated_cell_types.csv.gz
  connections_princeton.csv.gz

Fallback: Codex download API (often needs FlyWire / Google login):
  https://codex.flywire.ai/api/download?dataset=fafb
  https://codex.flywire.ai/api/download_resource?data_product=...&dataset=fafb

Cookie usage (Codex only):
  export CODEX_COOKIE='session=...'          # Cookie header value
  # or
  echo 'session=...' > data/raw/fafb/.codex_cookie   # gitignored
  python3 scripts/fetch_fafb.py --cookie-file data/raw/fafb/.codex_cookie
  # or
  python3 scripts/fetch_fafb.py --cookie 'session=...'

Manual drop: place the two CSV.gz files above under data/raw/fafb/, then
  python3 scripts/build_datasets.py

Writes data/raw/fafb/STATUS.json. Exit 0 even when auth-blocked (scaffold path).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
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

# Public mirror (SJCABS / Lee lab curated FAFB v783) — no Google login.
GCS_BASE = (
    "https://storage.googleapis.com/"
    "lee-lab_brain-and-nerve-cord-fly-connectome/compiled_data/fafb_783"
)
PUBLIC_META = f"{GCS_BASE}/fafb_783_meta.feather"
PUBLIC_EDGES = f"{GCS_BASE}/fafb_783_simple_edgelist.feather"

NOTE_RU_BLOCKED = (
    "Нужен вход в Codex (Google) или ручная выкладка CSV. "
    "Либо: открой https://codex.flywire.ai/api/download?dataset=fafb → войди → "
    "скачай consolidated_cell_types и connections_princeton → положи в data/raw/fafb/. "
    "Либо: CODEX_COOKIE / --cookie / data/raw/fafb/.codex_cookie и снова fetch_fafb.py. "
    "Пока работает scaffold."
)
NOTE_RU_PUBLIC = (
    "FAFB из публичного зеркала lee-lab (meta + simple_edgelist → CSV). "
    "Codex login не нужен."
)
NOTE_EN_BLOCKED = (
    "Codex FAFB bulk CSV needs FlyWire/Google login, or drop CSV.gz under data/raw/fafb/. "
    "Public lee-lab mirror failed or was skipped."
)


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


def download_to(url: str, dest: Path, headers: dict | None = None, timeout: int = 600) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    ctx = ssl.create_default_context()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        blob = resp.read()
    dest.write_bytes(blob)
    return len(blob)


def looks_like_login(body: bytes, ct: str) -> bool:
    text = body[:4000].decode("utf-8", "replace").lower()
    if "text/html" in ct and ("sign in" in text or "accounts.google" in text or "login" in text):
        return True
    if b"accounts.google.com" in body[:8000]:
        return True
    return False


def resolve_cookie(args: argparse.Namespace) -> str:
    if args.cookie.strip():
        return args.cookie.strip()
    env = (os.environ.get("CODEX_COOKIE") or "").strip()
    if env:
        return env
    cookie_file = args.cookie_file.strip() or os.environ.get("CODEX_COOKIE_FILE", "")
    if not cookie_file:
        default = RAW / ".codex_cookie"
        if default.is_file():
            cookie_file = str(default)
    if cookie_file:
        path = Path(cookie_file).expanduser()
        if path.is_file():
            return path.read_text().strip()
        print(f"WARN cookie file not found: {path}", file=sys.stderr)
    return ""


def csvs_ready() -> bool:
    types = RAW / "consolidated_cell_types.csv.gz"
    conn = RAW / "connections_princeton.csv.gz"
    if not conn.exists():
        conn = RAW / "connections_princeton_no_threshold.csv.gz"
    return (
        types.exists()
        and conn.exists()
        and types.stat().st_size > 1000
        and conn.stat().st_size > 1000
    )


def convert_public_feather(meta_path: Path, edges_path: Path) -> dict:
    """Write Codex-shaped CSV.gz from lee-lab feather tables. Needs pyarrow."""
    try:
        import pyarrow.feather as feather
    except ImportError as exc:
        raise RuntimeError(
            "pyarrow required for public FAFB mirror. "
            "Install: uv pip install pyarrow  (or pip install pyarrow)"
        ) from exc

    meta = feather.read_table(meta_path)
    edges = feather.read_table(edges_path)
    ids = [str(x) for x in meta.column("fafb_783_id").to_pylist()]
    types = meta.column("cell_type").to_pylist()
    nts = meta.column("neurotransmitter_predicted").to_pylist()

    types_path = RAW / "consolidated_cell_types.csv.gz"
    with gzip.open(types_path, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["root_id", "primary_type", "nt_type"])
        n_typed = 0
        for rid, ct, nt in zip(ids, types, nts):
            if not ct:
                continue
            w.writerow([rid, ct, nt or ""])
            n_typed += 1

    id_to_nt = {rid: (nt or "unk") for rid, nt in zip(ids, nts)}
    conn_path = RAW / "connections_princeton.csv.gz"
    pre = [str(x) for x in edges.column("pre").to_pylist()]
    post = [str(x) for x in edges.column("post").to_pylist()]
    counts = edges.column("count").to_pylist()
    with gzip.open(conn_path, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pre_root_id", "post_root_id", "syn_count", "nt_type"])
        for a, b, c in zip(pre, post, counts):
            w.writerow([a, b, int(c), id_to_nt.get(a, "unk")])

    return {
        "ok": True,
        "source": "lee-lab_gcs_fafb_783",
        "typed_neurons": n_typed,
        "edges": len(pre),
        "files": {
            "consolidated_cell_types.csv.gz": types_path.stat().st_size,
            "connections_princeton.csv.gz": conn_path.stat().st_size,
        },
    }


def try_public_mirror(skip_existing: bool) -> dict | None:
    meta_path = RAW / "fafb_783_meta.feather"
    edges_path = RAW / "fafb_783_simple_edgelist.feather"
    if skip_existing and csvs_ready():
        print("skip public mirror (CSV already present)")
        return {
            "ok": True,
            "skipped": True,
            "source": "existing_csv",
        }

    try:
        if not (skip_existing and meta_path.exists() and meta_path.stat().st_size > 1000):
            print(f"GET {PUBLIC_META}")
            n = download_to(PUBLIC_META, meta_path)
            print(f"  -> {meta_path.name} ({n:,} bytes)")
        else:
            print(f"skip {meta_path.name}")

        if not (skip_existing and edges_path.exists() and edges_path.stat().st_size > 1000):
            print(f"GET {PUBLIC_EDGES}")
            n = download_to(PUBLIC_EDGES, edges_path, timeout=900)
            print(f"  -> {edges_path.name} ({n:,} bytes)")
        else:
            print(f"skip {edges_path.name}")

        print("convert feather → CSV.gz …")
        return convert_public_feather(meta_path, edges_path)
    except Exception as exc:
        print(f"  WARN public mirror: {exc}", file=sys.stderr)
        return {"ok": False, "error": str(exc)}


def fetch_codex(cookie: str, skip_existing: bool, status: dict) -> None:
    headers_extra = {"Cookie": cookie} if cookie else {}
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
                try:
                    listing = json.loads(portal_body)
                    (RAW / "download_portal.json").write_text(
                        json.dumps(listing, indent=2)[:500_000]
                    )
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
        if skip_existing and dest.exists() and dest.stat().st_size > 1000:
            print(f"skip {dest.name}")
            status["files"][product] = {"ok": True, "skipped": True, "path": str(dest)}
            continue
        print(f"GET {url}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **headers_extra})
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                data = resp.read(64_000)
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
                if data[:2] == b"\x1f\x8b" or b"," in data[:200]:
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


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument(
        "--cookie",
        default="",
        help="Cookie header from a logged-in Codex session (or set CODEX_COOKIE)",
    )
    parser.add_argument(
        "--cookie-file",
        default="",
        help="Path to file with Cookie header (default: data/raw/fafb/.codex_cookie or CODEX_COOKIE_FILE)",
    )
    parser.add_argument(
        "--codex-only",
        action="store_true",
        help="Skip public lee-lab GCS mirror; only try Codex API",
    )
    parser.add_argument(
        "--public-only",
        action="store_true",
        help="Only use public lee-lab mirror (no Codex)",
    )
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)

    cookie = resolve_cookie(args)
    status: dict = {
        "dataset": "fafb",
        "sex": "female",
        "portal": PORTAL,
        "public_mirror": GCS_BASE,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "auth_required": False,
        "files": {},
        "note": "",
        "note_ru": "",
    }

    public = None
    if not args.codex_only:
        public = try_public_mirror(args.skip_existing)
        status["files"]["public_mirror"] = public or {"ok": False}
        if public and public.get("ok"):
            status["auth_required"] = False
            status["note"] = NOTE_RU_PUBLIC
            status["note_ru"] = NOTE_RU_PUBLIC
            status["source"] = public.get("source", "lee-lab_gcs_fafb_783")

    if not csvs_ready() and not args.public_only:
        if cookie:
            print("Using Cookie from --cookie / CODEX_COOKIE / cookie file")
        fetch_codex(cookie, args.skip_existing, status)

    if csvs_ready():
        status["auth_required"] = False
        if not status.get("note_ru"):
            status["note_ru"] = "CSV на месте — реальные агрегаты FAFB."
            status["note"] = status["note_ru"]
    elif status.get("auth_required") or not csvs_ready():
        status["auth_required"] = True
        status["note_ru"] = NOTE_RU_BLOCKED
        status["note"] = NOTE_RU_BLOCKED
        status["note_en"] = NOTE_EN_BLOCKED

    (RAW / "STATUS.json").write_text(json.dumps(status, indent=2, ensure_ascii=False))
    print("Wrote", RAW / "STATUS.json")
    print(status.get("note_ru") or status.get("note") or "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
