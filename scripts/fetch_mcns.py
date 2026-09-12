#!/usr/bin/env python3
"""Download public Male CNS (male-cns:v1.0) sources used by the game.

Canonical story:
  Google Research + HHMI Janelia complete male Drosophila CNS connectome
  https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/

We do NOT download the EM volume. We fetch the official annotation table
and the Cell Type Explorer catalog / pathway pages (synaptic counts).
"""

from __future__ import annotations

import argparse
import ssl
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TYPES = RAW / "types"

GCS_ANNOT = (
    "https://storage.googleapis.com/flyem-male-cns/v1.0/"
    "connectome-data/flat-connectome/"
    "body-annotations-male-cns-v1.0-minconf-0.5.feather"
)
NEURONS_JSON = (
    "https://raw.githubusercontent.com/"
    "reiserlab/celltype-explorer-drosophila-male-cns/main/data/neurons.json"
)
TYPE_BASE = "https://reiserlab.github.io/celltype-explorer-drosophila-male-cns/types"
TYPE_PAGES = [
    "DNg13_L",
    "DNg13_R",
    "DNa02",
    "LoVP92",
    "LoVP92_L",
    "LoVP92_R",
    "VES200m",
    "VES200m_L",
    "VES200m_R",
    "R1-R6",
    "L1",
    "L2",
    "L3",
    "C2",
    "Mi1",
    "Tm3",
    "Mi4",
    "T4a",
    "T4b",
    "T5a",
    "LC10a",
    "LC10b",
    "LC6",
    "MeTu1",
    "LoVP11",
    "AOTU019",
    "CB0244",
    "LAL073",
    "GNG532",
    "SMP108",
    "DNg97",
    "DNp13",
    "IN16B045",
    "IN19A016",
    "IN17A025",
]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"GET {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
        dest.write_bytes(resp.read())
    print(f"  -> {dest} ({dest.stat().st_size:,} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Do not re-download files that already exist",
    )
    args = parser.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    TYPES.mkdir(parents=True, exist_ok=True)

    jobs = [
        (GCS_ANNOT, RAW / "body-annotations-male-cns-v1.0-minconf-0.5.feather"),
        (NEURONS_JSON, RAW / "neurons.json"),
    ]
    for name in TYPE_PAGES:
        jobs.append((f"{TYPE_BASE}/{name}.html", TYPES / f"{name}.html"))

    for url, dest in jobs:
        if args.skip_existing and dest.exists() and dest.stat().st_size > 1000:
            print(f"skip {dest.name}")
            continue
        try:
            fetch(url, dest)
        except Exception as exc:
            print(f"WARN failed {url}: {exc}", file=sys.stderr)

    print("Done. Next: python3 scripts/build_circuit.py && python3 scripts/build_datasets.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
