#!/usr/bin/env python3
"""Build a playable visual-motor subgraph from official MaleCNS v1.0 tables.

Prefer real synaptic weights parsed from Cell Type Explorer type pages.
Heuristic optic-lobe weights are used only when no partner table covers the
edge; every edge records evidence + weight_source (explorer|heuristic|mirror).

Optional --expand-partners N adds top-N upstream/downstream partners of key
types (browser-friendly cap).

Outputs:
  data/processed/circuit.json          (alias of male-cns)
  data/processed/circuit_malecns.json
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TYPES = RAW / "types"
OUT_DIR = ROOT / "data" / "processed"

ROW_RE = re.compile(
    r"<tr id=(?P<kind>[ud])(?P<n>\d+)>"
    r"<td[^>]*data-body-ids=(?P<ids>\[[^\]]*\])>"
    r"<a href=(?P<href>[^>]+)>(?P<label>[^<]+)</a>"
    r"<td>(?P<count>\d+)"
    r"<td><abbr title=(?P<nttitle>[^>]*)>(?P<nt>[^<]+)</abbr>"
    r"<td[^>]*>(?P<weight>[\d,]+)",
    re.I,
)

# Fly CNS convention used in the MaleCNS paper for this motif:
# VES200m (Glu) inhibits DNg13. ACh is treated as excitatory.
NT_SIGN = {"ACh": 1, "GABA": -1, "Glu": -1, "His": 1, "OA": 1, "DA": 1, "5HT": 1, "unk": 1, "unc": 1}

# Seed type pages we try to fetch / parse for real weights
KEY_TYPES = [
    "R1-R6", "L1", "L2", "L3", "C2", "Mi1", "Tm3", "Mi4",
    "T4a", "T4b", "T5a", "LC10a", "LC10b", "LC6", "MeTu1",
    "LoVP92", "LoVP92_L", "LoVP92_R", "LoVP11",
    "AOTU019", "CB0244", "LAL073", "VES200m", "VES200m_L", "VES200m_R",
    "GNG532", "SMP108",
    "DNg13_L", "DNg13_R", "DNa02", "DNg97", "DNp13",
    "IN16B045", "IN19A016", "IN17A025",
]


def optic_nodes(side: str) -> list[dict]:
    """Lamina → medulla → lobula / LP → VPN cascade, one hemisphere."""
    m = 1 if side == "L" else -1
    cx = 0.05 if side == "L" else 0.95

    def x(dx: float) -> float:
        return cx + m * dx

    return [
        {"id": f"R1-R6_{side}", "type": "R1-R6", "side": side, "region": "optic", "role": "photoreceptor", "nt": "His", "x": x(0.00), "y": 0.14, "layer": "lamina"},
        {"id": f"L1_{side}", "type": "L1", "side": side, "region": "optic", "role": "lamina", "nt": "His", "x": x(0.04), "y": 0.20, "layer": "lamina"},
        {"id": f"L2_{side}", "type": "L2", "side": side, "region": "optic", "role": "lamina", "nt": "His", "x": x(0.04), "y": 0.27, "layer": "lamina"},
        {"id": f"L3_{side}", "type": "L3", "side": side, "region": "optic", "role": "lamina", "nt": "His", "x": x(0.04), "y": 0.34, "layer": "lamina"},
        {"id": f"C2_{side}", "type": "C2", "side": side, "region": "optic", "role": "lamina_feedback", "nt": "GABA", "x": x(0.07), "y": 0.17, "layer": "lamina"},
        {"id": f"Mi1_{side}", "type": "Mi1", "side": side, "region": "optic", "role": "medulla", "nt": "ACh", "x": x(0.10), "y": 0.22, "layer": "medulla"},
        {"id": f"Tm3_{side}", "type": "Tm3", "side": side, "region": "optic", "role": "medulla", "nt": "ACh", "x": x(0.10), "y": 0.30, "layer": "medulla"},
        {"id": f"Mi4_{side}", "type": "Mi4", "side": side, "region": "optic", "role": "medulla_inhibit", "nt": "GABA", "x": x(0.12), "y": 0.38, "layer": "medulla"},
        {"id": f"T4a_{side}", "type": "T4a", "side": side, "region": "optic", "role": "motion", "nt": "ACh", "x": x(0.16), "y": 0.24, "layer": "lobula_plate"},
        {"id": f"T4b_{side}", "type": "T4b", "side": side, "region": "optic", "role": "motion", "nt": "ACh", "x": x(0.16), "y": 0.31, "layer": "lobula_plate"},
        {"id": f"T5a_{side}", "type": "T5a", "side": side, "region": "optic", "role": "motion", "nt": "ACh", "x": x(0.16), "y": 0.39, "layer": "lobula"},
        {"id": f"LC10a_{side}", "type": "LC10a", "side": side, "region": "optic", "role": "object", "nt": "ACh", "x": x(0.21), "y": 0.22, "layer": "lobula"},
        {"id": f"LC10b_{side}", "type": "LC10b", "side": side, "region": "optic", "role": "object", "nt": "ACh", "x": x(0.21), "y": 0.29, "layer": "lobula"},
        {"id": f"LC6_{side}", "type": "LC6", "side": side, "region": "optic", "role": "object", "nt": "ACh", "x": x(0.21), "y": 0.36, "layer": "lobula"},
        {"id": f"MeTu1_{side}", "type": "MeTu1", "side": side, "region": "optic", "role": "relay", "nt": "ACh", "x": x(0.25), "y": 0.27, "layer": "medulla"},
        {"id": f"LoVP92_{side}", "type": "LoVP92", "side": side, "region": "optic", "role": "frontal_vpn", "nt": "ACh", "x": x(0.28), "y": 0.34, "layer": "lobula"},
        {"id": f"LoVP11_{side}", "type": "LoVP11", "side": side, "region": "optic", "role": "vpn", "nt": "ACh", "x": x(0.28), "y": 0.42, "layer": "lobula"},
    ]


SEED_NODES = [
    *optic_nodes("L"),
    *optic_nodes("R"),
    {"id": "AOTU019_L", "type": "AOTU019", "side": "L", "region": "central", "role": "relay", "nt": "ACh", "x": 0.34, "y": 0.30, "layer": "AOTU"},
    {"id": "AOTU019_R", "type": "AOTU019", "side": "R", "region": "central", "role": "relay", "nt": "ACh", "x": 0.66, "y": 0.30, "layer": "AOTU"},
    {"id": "CB0244_L", "type": "CB0244", "side": "L", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.38, "y": 0.38, "layer": "protocerebrum"},
    {"id": "CB0244_R", "type": "CB0244", "side": "R", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.62, "y": 0.38, "layer": "protocerebrum"},
    {"id": "LAL073_L", "type": "LAL073", "side": "L", "region": "central", "role": "integrate", "nt": "Glu", "x": 0.42, "y": 0.32, "layer": "LAL"},
    {"id": "LAL073_R", "type": "LAL073", "side": "R", "region": "central", "role": "integrate", "nt": "Glu", "x": 0.58, "y": 0.32, "layer": "LAL"},
    {"id": "VES200m_L", "type": "VES200m", "side": "L", "region": "central", "role": "inhibit_steer", "nt": "Glu", "x": 0.40, "y": 0.48, "layer": "VES"},
    {"id": "VES200m_R", "type": "VES200m", "side": "R", "region": "central", "role": "inhibit_steer", "nt": "Glu", "x": 0.60, "y": 0.48, "layer": "VES"},
    {"id": "GNG532_L", "type": "GNG532", "side": "L", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.44, "y": 0.54, "layer": "GNG"},
    {"id": "GNG532_R", "type": "GNG532", "side": "R", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.56, "y": 0.54, "layer": "GNG"},
    {"id": "SMP108_L", "type": "SMP108", "side": "L", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.46, "y": 0.28, "layer": "SMP"},
    {"id": "SMP108_R", "type": "SMP108", "side": "R", "region": "central", "role": "integrate", "nt": "ACh", "x": 0.54, "y": 0.28, "layer": "SMP"},
    {"id": "DNg13_L", "type": "DNg13", "side": "L", "region": "descending", "role": "steer_left", "nt": "ACh", "x": 0.40, "y": 0.66, "layer": "DN"},
    {"id": "DNg13_R", "type": "DNg13", "side": "R", "region": "descending", "role": "steer_right", "nt": "ACh", "x": 0.60, "y": 0.66, "layer": "DN"},
    {"id": "DNg97_L", "type": "DNg97", "side": "L", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.34, "y": 0.58, "layer": "DN"},
    {"id": "DNg97_R", "type": "DNg97", "side": "R", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.66, "y": 0.58, "layer": "DN"},
    {"id": "DNa02", "type": "DNa02", "side": "B", "region": "descending", "role": "rotate", "nt": "ACh", "x": 0.50, "y": 0.60, "layer": "DN"},
    {"id": "DNp13_L", "type": "DNp13", "side": "L", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.44, "y": 0.62, "layer": "DN"},
    {"id": "DNp13_R", "type": "DNp13", "side": "R", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.56, "y": 0.62, "layer": "DN"},
    {"id": "IN16B045_L", "type": "IN16B045", "side": "L", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.40, "y": 0.80, "layer": "T2"},
    {"id": "IN16B045_R", "type": "IN16B045", "side": "R", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.60, "y": 0.80, "layer": "T2"},
    {"id": "IN19A016_L", "type": "IN19A016", "side": "L", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.38, "y": 0.86, "layer": "T1"},
    {"id": "IN19A016_R", "type": "IN19A016", "side": "R", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.62, "y": 0.86, "layer": "T1"},
    {"id": "IN17A025_L", "type": "IN17A025", "side": "L", "region": "vnc", "role": "drop", "nt": "ACh", "x": 0.46, "y": 0.92, "layer": "T3"},
    {"id": "IN17A025_R", "type": "IN17A025", "side": "R", "region": "vnc", "role": "drop", "nt": "ACh", "x": 0.54, "y": 0.92, "layer": "T3"},
]

# Heuristic optic edges used only when explorer tables lack a covering weight.
HEURISTIC_OPTIC = [
    ("R1-R6", "L1", 80, "His", "optic-lobe feedforward"),
    ("R1-R6", "L2", 70, "His", "optic-lobe feedforward"),
    ("R1-R6", "L3", 55, "His", "lamina L3 pathway"),
    ("L1", "C2", 30, "His", "lamina → C2 feedback"),
    ("C2", "L1", 22, "GABA", "C2 inhibitory feedback"),
    ("C2", "L2", 18, "GABA", "C2 inhibitory feedback"),
    ("L1", "Mi1", 55, "His", "lamina → medulla"),
    ("L2", "Mi1", 48, "His", "lamina → medulla"),
    ("L2", "Tm3", 42, "His", "lamina → Tm3"),
    ("L3", "Tm3", 36, "His", "L3 → Tm3"),
    ("Mi1", "T4a", 42, "ACh", "medulla → lobula plate motion"),
    ("Tm3", "T4b", 38, "ACh", "Tm3 → T4b motion"),
    ("Mi1", "Mi4", 20, "ACh", "Mi1 → Mi4"),
    ("Mi4", "T4a", 24, "GABA", "Mi4 motion gain control"),
    ("L2", "T5a", 38, "His", "lamina/lobula motion pathway"),
    ("T4a", "LC10a", 36, "ACh", "motion → object feature"),
    ("T4b", "LC10b", 32, "ACh", "motion → LC10b"),
    ("T5a", "LC10a", 28, "ACh", "motion → object feature"),
    ("T5a", "LC6", 22, "ACh", "motion → LC6"),
    ("Mi1", "MeTu1", 26, "ACh", "medulla → MeTu relay"),
    ("Tm3", "MeTu1", 20, "ACh", "Tm3 → MeTu"),
    ("LC10a", "LoVP92", 24, "ACh", "VPN convergence"),
    ("LC10b", "LoVP92", 18, "ACh", "LC10b → LoVP92"),
    ("LC6", "LoVP11", 16, "ACh", "LC6 → LoVP11"),
    ("MeTu1", "LoVP92", 14, "ACh", "MeTu → VPN"),
    ("LoVP11", "LoVP92", 12, "ACh", "VPN local mix"),
]


def parse_page(html: str, source: str) -> list[dict]:
    edges = []
    for m in ROW_RE.finditer(html):
        label = m.group("label").strip()
        name = re.sub(r"\s*\([LRM]\)$", "", label).strip()
        side = "L" if "(L)" in label else "R" if "(R)" in label else "M" if "(M)" in label else None
        try:
            ids = json.loads(m.group("ids"))
        except json.JSONDecodeError:
            ids = []
        edges.append(
            {
                "kind": "in" if m.group("kind") == "u" else "out",
                "partner": name,
                "partner_label": label,
                "side": side,
                "n_cells": int(m.group("count")),
                "nt": m.group("nt"),
                "weight": int(m.group("weight").replace(",", "")),
                "body_ids": ids[:6],
                "source": source,
            }
        )
    return edges


def load_catalog() -> dict:
    path = RAW / "neurons.json"
    if not path.exists():
        return {"names": [], "metadata": {}}
    return json.loads(path.read_text())


def load_parsed() -> dict[str, list[dict]]:
    parsed: dict[str, list[dict]] = {}
    if not TYPES.exists():
        return parsed
    for page in TYPES.glob("*.html"):
        if page.name.endswith(".raw.html"):
            continue
        parsed[page.stem] = parse_page(page.read_text(errors="replace"), page.stem)
    return parsed


def strip_side(name: str) -> str:
    return re.sub(r"_[LRMB]$", "", name)


def resolve_node_id(partner: str, partner_side: str | None, nodes_by_type: dict[str, list[str]], prefer_side: str | None) -> str | None:
    """Map partner type (+ optional side) onto an existing node id."""
    base = strip_side(partner)
    candidates = nodes_by_type.get(base) or nodes_by_type.get(partner) or []
    if not candidates:
        return None
    side = partner_side or prefer_side
    if side:
        for cid in candidates:
            nside = cid.rsplit("_", 1)[-1] if "_" in cid else None
            if nside == side:
                return cid
    # bilateral / single
    if len(candidates) == 1:
        return candidates[0]
    # prefer matching preferred side, else first
    if prefer_side:
        for cid in candidates:
            if cid.endswith(f"_{prefer_side}"):
                return cid
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expand-partners", type=int, default=6, help="Top-N partners of key types to auto-add")
    parser.add_argument("--max-nodes", type=int, default=120, help="Hard cap for browser-friendly size")
    args = parser.parse_args()

    catalog = load_catalog()
    names = set(catalog.get("names") or [])
    parsed = load_parsed()

    nodes = {
        n["id"]: dict(n, n_cells=n.get("n_cells", 1), body_ids=[], official=n["type"] in names)
        for n in SEED_NODES
    }

    def nodes_by_type() -> dict[str, list[str]]:
        by: dict[str, list[str]] = defaultdict(list)
        for nid, n in nodes.items():
            by[n["type"]].append(nid)
        return by

    edges: list[dict] = []

    def add_edge(pre, post, weight, nt, evidence, weight_source="heuristic"):
        if pre not in nodes or post not in nodes or weight <= 0:
            return
        sign = NT_SIGN.get(nt, 1)
        edges.append(
            {
                "pre": pre,
                "post": post,
                "weight": int(weight),
                "nt": nt,
                "sign": sign,
                "evidence": evidence,
                "weight_source": weight_source,
            }
        )

    # --- Auto-expand: top partners of key seed types ---
    expand_seeds = ["DNg13_L", "DNa02", "LoVP92", "VES200m", "CB0244", "LAL073", "Mi1", "Tm3", "LC10a"]
    added = 0
    for seed in expand_seeds:
        rows = parsed.get(seed) or []
        # also try without side
        if not rows and "_" in seed:
            rows = parsed.get(seed.rsplit("_", 1)[0]) or []
        ranked = sorted(rows, key=lambda e: e["weight"], reverse=True)
        for e in ranked[: max(0, args.expand_partners)]:
            if len(nodes) >= args.max_nodes:
                break
            partner = e["partner"]
            base = strip_side(partner)
            if any(n["type"] == base for n in nodes.values()):
                continue
            # place expanded partners near their source region
            seed_node = next((n for n in nodes.values() if n["id"].startswith(seed.split("_")[0]) or n["type"] == strip_side(seed)), None)
            region = seed_node["region"] if seed_node else "central"
            side = e["side"] or (seed_node["side"] if seed_node and seed_node.get("side") in ("L", "R") else "B")
            if side not in ("L", "R", "B", "M"):
                side = "B"
            nid = f"{base}_{side}" if side in ("L", "R") else base
            if nid in nodes:
                continue
            # stagger layout
            x = 0.48 + (added % 7) * 0.03 - 0.09
            y = 0.45 + (added // 7) * 0.04
            if region == "optic":
                x = 0.22 + (added % 5) * 0.02
                y = 0.35 + (added // 5) * 0.03
            elif region == "descending":
                y = 0.62 + (added % 4) * 0.02
            elif region == "vnc":
                y = 0.84 + (added % 3) * 0.02
            nodes[nid] = {
                "id": nid,
                "type": base,
                "side": side if side != "M" else "B",
                "region": region,
                "role": "expand",
                "nt": e["nt"] if e["kind"] == "out" else "unk",
                "x": x,
                "y": y,
                "layer": "expand",
                "n_cells": e["n_cells"],
                "body_ids": e["body_ids"],
                "official": base in names,
                "expanded": True,
            }
            added += 1

    by_type = nodes_by_type()

    # --- Wire real explorer weights between nodes already in the subgraph ---
    # Index: for each page stem, outbound (kind=out) means page → partner;
    # inbound (kind=in) means partner → page.
    explorer_hits = 0
    for page_stem, rows in parsed.items():
        page_base = strip_side(page_stem)
        page_side = None
        if page_stem.endswith("_L"):
            page_side = "L"
        elif page_stem.endswith("_R"):
            page_side = "R"
        page_ids = by_type.get(page_base) or []
        if not page_ids and page_stem in nodes:
            page_ids = [page_stem]
        if not page_ids:
            continue
        for e in rows:
            partner_base = strip_side(e["partner"])
            if e["kind"] == "out":
                for pid in page_ids:
                    prefer = nodes[pid].get("side") if nodes[pid].get("side") in ("L", "R") else page_side
                    post = resolve_node_id(partner_base, e["side"], by_type, prefer)
                    if post:
                        add_edge(
                            pid,
                            post,
                            e["weight"],
                            e["nt"],
                            f"Cell Type Explorer {page_stem} downstream",
                            "explorer",
                        )
                        explorer_hits += 1
                        if page_side is None and e["side"] in ("L", "R"):
                            # annotate cells on first hit
                            nodes[pid]["n_cells"] = max(nodes[pid].get("n_cells", 1), e["n_cells"])
            else:  # in
                for pid in page_ids:
                    prefer = nodes[pid].get("side") if nodes[pid].get("side") in ("L", "R") else page_side
                    pre = resolve_node_id(partner_base, e["side"], by_type, prefer)
                    if pre:
                        add_edge(
                            pre,
                            pid,
                            e["weight"],
                            e["nt"],
                            f"Cell Type Explorer {page_stem} upstream",
                            "explorer",
                        )
                        explorer_hits += 1
                        nodes[pre]["n_cells"] = max(nodes[pre].get("n_cells", 1), e["n_cells"])
                        if e["nt"] and e["nt"] not in ("unc", "unk"):
                            nodes[pre]["nt"] = e["nt"]

    # Deduplicate keeping max weight; prefer explorer over heuristic later
    def merge_edges(edge_list: list[dict]) -> list[dict]:
        uniq: dict[tuple, dict] = {}
        priority = {"explorer": 3, "mirror": 2, "heuristic": 1}
        for e in edge_list:
            key = (e["pre"], e["post"])
            prev = uniq.get(key)
            if prev is None:
                uniq[key] = e
                continue
            p_new = priority.get(e.get("weight_source", "heuristic"), 0)
            p_old = priority.get(prev.get("weight_source", "heuristic"), 0)
            if p_new > p_old or (p_new == p_old and e["weight"] > prev["weight"]):
                uniq[key] = e
        return list(uniq.values())

    edges = merge_edges(edges)
    existing = {(e["pre"], e["post"]) for e in edges}

    # --- Heuristic optic fill (only missing edges) ---
    for side in ("L", "R"):
        for pre_t, post_t, w, nt, note in HEURISTIC_OPTIC:
            pre, post = f"{pre_t}_{side}", f"{post_t}_{side}"
            if (pre, post) not in existing:
                add_edge(pre, post, w, nt, f"{note} (heuristic fallback)", "heuristic")

    # Paper motif LoVP92 → VES200m if missing
    for pre, post, w, note in [
        ("LoVP92_L", "VES200m_L", 90, "Cell paper frontal VPN→VES200m"),
        ("LoVP92_R", "VES200m_R", 90, "Cell paper frontal VPN→VES200m"),
        ("LoVP92_L", "VES200m_R", 40, "Cell paper bilateral VES200m"),
        ("LoVP92_R", "VES200m_L", 40, "Cell paper bilateral VES200m"),
    ]:
        if (pre, post) not in existing:
            add_edge(pre, post, w, "ACh", note, "heuristic")

    # Central heuristic fill
    for side in ("L", "R"):
        for pre, post, w, nt, note in [
            (f"LoVP92_{side}", f"AOTU019_{side}", 40, "ACh", "VPN → AOTU"),
            (f"MeTu1_{side}", f"AOTU019_{side}", 28, "ACh", "MeTu → AOTU"),
            (f"AOTU019_{side}", f"CB0244_{side}", 34, "ACh", "AOTU → CB0244"),
            (f"AOTU019_{side}", f"LAL073_{side}", 30, "ACh", "AOTU → LAL"),
            (f"LoVP92_{side}", f"CB0244_{side}", 36, "ACh", "VPN → central integrator"),
            (f"LoVP92_{side}", f"LAL073_{side}", 28, "ACh", "VPN → LAL"),
            (f"LoVP11_{side}", f"SMP108_{side}", 18, "ACh", "VPN → SMP"),
            (f"SMP108_{side}", f"GNG532_{side}", 22, "ACh", "SMP → GNG"),
            (f"CB0244_{side}", f"GNG532_{side}", 26, "ACh", "proto → GNG"),
            (f"GNG532_{side}", f"DNg97_{side}", 24, "ACh", "GNG → DNg97"),
            (f"CB0244_{side}", f"DNp13_{side}", 20, "ACh", "proto → DNp13"),
        ]:
            if (pre, post) not in {(e["pre"], e["post"]) for e in edges}:
                add_edge(pre, post, w, nt, f"{note} (heuristic fallback)", "heuristic")

    # Official DNg13 mirror extras if explorer did not cover both hemispheres
    dng = parsed.get("DNg13_L") or []
    wanted_in = {
        "VES200m": ("VES200m", "ipsi"),
        "CB0244": ("CB0244", "ipsi"),
        "LAL073": ("LAL073", "contra"),
        "GNG532": ("GNG532", "ipsi"),
        "DNg97": ("DNg97", "ipsi"),
    }
    wanted_out = {"IN16B045": "IN16B045", "IN19A016": "IN19A016", "IN17A025": "IN17A025"}
    have = {(e["pre"], e["post"]) for e in edges}
    for e in dng:
        if e["kind"] == "in" and e["partner"] in wanted_in:
            type_name, mode = wanted_in[e["partner"]]
            for hemi in ("L", "R"):
                pre_side = hemi if mode == "ipsi" else ("R" if hemi == "L" else "L")
                pre = f"{type_name}_{pre_side}"
                post = f"DNg13_{hemi}"
                if (pre, post) not in have:
                    add_edge(pre, post, e["weight"], e["nt"], "DNg13_L upstream (bilateral mirror)", "mirror")
        if e["kind"] == "out" and e["partner"] in wanted_out:
            type_name = wanted_out[e["partner"]]
            for hemi in ("L", "R"):
                post = f"{type_name}_{hemi}"
                if (f"DNg13_{hemi}", post) not in have:
                    add_edge(f"DNg13_{hemi}", post, e["weight"], "ACh", "DNg13_L downstream (bilateral)", "mirror")
                cross = f"{type_name}_{'R' if hemi == 'L' else 'L'}"
                if (f"DNg13_{hemi}", cross) not in have:
                    add_edge(
                        f"DNg13_{hemi}",
                        cross,
                        max(12, e["weight"] // 3),
                        "ACh",
                        "cross-hemisphere VNC residual",
                        "mirror",
                    )

    dna = parsed.get("DNa02") or []
    have = {(e["pre"], e["post"]) for e in edges}
    if dna:
        top_in = [e for e in dna if e["kind"] == "in"][:1]
        if top_in:
            w = max(20, top_in[0]["weight"])
            for pre in ("CB0244_L", "CB0244_R"):
                if (pre, "DNa02") not in have:
                    add_edge(pre, "DNa02", w, top_in[0]["nt"], "DNa02 upstream", "mirror")
            for pre in ("LAL073_L", "LAL073_R"):
                if (pre, "DNa02") not in have:
                    add_edge(pre, "DNa02", 18, "Glu", "DNa02 LAL mix", "heuristic")
        for post in ("IN17A025_L", "IN17A025_R"):
            if ("DNa02", post) not in have:
                add_edge("DNa02", post, 28, "ACh", "DNa02 → VNC", "heuristic")

    have = {(e["pre"], e["post"]) for e in edges}
    for side in ("L", "R"):
        if (f"DNg97_{side}", f"DNg13_{side}") not in have:
            add_edge(f"DNg97_{side}", f"DNg13_{side}", 48, "ACh", "DNg97 ipsilateral facilitation", "heuristic")
        if (f"DNp13_{side}", f"DNg13_{side}") not in have:
            add_edge(f"DNp13_{side}", f"DNg13_{side}", 32, "ACh", "DNp13 ipsilateral facilitation", "heuristic")
    if ("DNg13_L", "DNg13_R") not in have:
        add_edge("DNg13_L", "DNg13_R", 90, "Glu", "bilateral DN mutual inhibition", "heuristic")
    if ("DNg13_R", "DNg13_L") not in have:
        add_edge("DNg13_R", "DNg13_L", 90, "Glu", "bilateral DN mutual inhibition", "heuristic")

    edges = merge_edges(edges)

    # Pathways catalog (inspired by Codex Pathways / Cell paper motifs)
    pathways = [
        {
            "id": "steering_ves",
            "label": "руление LoVP92→VES→DNg13",
            "nodes": ["LoVP92_L", "VES200m_L", "DNg13_L", "LoVP92_R", "VES200m_R", "DNg13_R"],
            "note": "Cell paper frontal VPN steering motif",
        },
        {
            "id": "motion_t4",
            "label": "движение Mi1/Tm3→T4/T5→LC",
            "nodes": [n["id"] for n in nodes.values() if n["type"] in ("Mi1", "Tm3", "T4a", "T4b", "T5a", "LC10a", "LC10b")],
            "note": "classic optic motion cascade",
        },
        {
            "id": "object_lc10",
            "label": "объект LC10→LoVP92→центр",
            "nodes": [n["id"] for n in nodes.values() if n["type"] in ("LC10a", "LC10b", "LoVP92", "AOTU019", "CB0244")],
            "note": "object feature → VPN → central",
        },
        {
            "id": "rotate_dna02",
            "label": "поворот → DNa02",
            "nodes": ["CB0244_L", "CB0244_R", "LAL073_L", "LAL073_R", "DNa02", "IN17A025_L", "IN17A025_R"],
            "note": "DNa02 rotation pathway",
        },
    ]

    region_order = {"optic": 0, "central": 1, "descending": 2, "vnc": 3}
    side_order = {"L": 0, "B": 1, "R": 2, "M": 1}

    def node_sort_key(n: dict):
        return (
            region_order.get(n["region"], 9),
            side_order.get(n.get("side"), 5),
            n.get("y", 0),
            n.get("x", 0),
            n["id"],
        )

    ordered_nodes = sorted(nodes.values(), key=node_sort_key)
    n_explorer = sum(1 for e in edges if e.get("weight_source") == "explorer")
    n_heur = sum(1 for e in edges if e.get("weight_source") == "heuristic")
    n_mirror = sum(1 for e in edges if e.get("weight_source") == "mirror")

    payload = {
        "source": {
            "name": "Male CNS connectome v1.0",
            "dataset": "male-cns",
            "dataset_id": "male-cns:v1.0",
            "sex": "male",
            "uuid": "4b2087c0fbe046bfaf0d60bc970e3e5d",
            "neurons": 166700,
            "synapses": 125_000_000,
            "types_in_catalog": len(names),
            "blog": "https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/",
            "portal": "https://male-cns.janelia.org/",
            "neuprint": "https://neuprint.janelia.org/",
            "codex": "https://codex.flywire.ai/?dataset=male-cns",
            "codex_dataset": "male-cns",
            "neuroglancer": "https://neuroglancer-demo.appspot.com/#!gs://flyem-male-cns/v1.0/male-cns-v1.0.jso",
            "explorer": "https://reiserlab.github.io/celltype-explorer-drosophila-male-cns/",
            "annotations": "gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather",
            "license": "CC-BY",
            "weight_stats": {
                "explorer": n_explorer,
                "heuristic": n_heur,
                "mirror": n_mirror,
                "explorer_hits_raw": explorer_hits,
            },
            "note": (
                "Playable subgraph of the official visual–motor / steering motif. "
                "Edge weights prefer Cell Type Explorer synapse counts; heuristics fill gaps. "
                "Not a full 166k-neuron simulation."
            ),
        },
        "nodes": ordered_nodes,
        "edges": edges,
        "pathways": pathways,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_main = OUT_DIR / "circuit_malecns.json"
    out_alias = OUT_DIR / "circuit.json"
    text = json.dumps(payload, indent=2)
    out_main.write_text(text)
    out_alias.write_text(text)
    print(
        f"Wrote {out_main} (+ alias)  nodes={len(nodes)} edges={len(edges)} "
        f"explorer={n_explorer} heuristic={n_heur} mirror={n_mirror} catalog={len(names)} expanded={added}"
    )


if __name__ == "__main__":
    main()
