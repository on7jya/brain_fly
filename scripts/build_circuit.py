#!/usr/bin/env python3
"""Build a playable visual-motor subgraph from official MaleCNS v1.0 tables.

Nodes are real cell types from the Cell Type Explorer catalog (11,751 types,
dataset male-cns:v1.0). Edges prefer synaptic counts parsed from official
type pages. The LoVP92 → VES200m → DNg13 steering motif is the pathway
highlighted in the companion Cell paper and the Janelia visual-motor video.

Bilateral optic → central → DN → VNC pathways are mirrored so left/right
steering stays symmetric (no one-sided “playable opponent” excitatory hack).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TYPES = RAW / "types"
OUT = ROOT / "data" / "processed" / "circuit.json"

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
NT_SIGN = {"ACh": 1, "GABA": -1, "Glu": -1, "His": 1, "OA": 1, "DA": 1, "5HT": 1, "unk": 1}


def optic_nodes(side: str) -> list[dict]:
    """Lamina → medulla → lobula / LP → VPN cascade, one hemisphere."""
    m = 1 if side == "L" else -1
    cx = 0.05 if side == "L" else 0.95
    # x offsets grow toward the midline
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
    # --- central brain (bilateral) ---
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
    # --- descending ---
    {"id": "DNg13_L", "type": "DNg13", "side": "L", "region": "descending", "role": "steer_left", "nt": "ACh", "x": 0.40, "y": 0.66, "layer": "DN"},
    {"id": "DNg13_R", "type": "DNg13", "side": "R", "region": "descending", "role": "steer_right", "nt": "ACh", "x": 0.60, "y": 0.66, "layer": "DN"},
    {"id": "DNg97_L", "type": "DNg97", "side": "L", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.34, "y": 0.58, "layer": "DN"},
    {"id": "DNg97_R", "type": "DNg97", "side": "R", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.66, "y": 0.58, "layer": "DN"},
    {"id": "DNa02", "type": "DNa02", "side": "B", "region": "descending", "role": "rotate", "nt": "ACh", "x": 0.50, "y": 0.60, "layer": "DN"},
    {"id": "DNp13_L", "type": "DNp13", "side": "L", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.44, "y": 0.62, "layer": "DN"},
    {"id": "DNp13_R", "type": "DNp13", "side": "R", "region": "descending", "role": "steer_mod", "nt": "ACh", "x": 0.56, "y": 0.62, "layer": "DN"},
    # --- VNC (bilateral + shared drop) ---
    {"id": "IN16B045_L", "type": "IN16B045", "side": "L", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.40, "y": 0.80, "layer": "T2"},
    {"id": "IN16B045_R", "type": "IN16B045", "side": "R", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.60, "y": 0.80, "layer": "T2"},
    {"id": "IN19A016_L", "type": "IN19A016", "side": "L", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.38, "y": 0.86, "layer": "T1"},
    {"id": "IN19A016_R", "type": "IN19A016", "side": "R", "region": "vnc", "role": "leg_inter", "nt": "ACh", "x": 0.62, "y": 0.86, "layer": "T1"},
    {"id": "IN17A025_L", "type": "IN17A025", "side": "L", "region": "vnc", "role": "drop", "nt": "ACh", "x": 0.46, "y": 0.92, "layer": "T3"},
    {"id": "IN17A025_R", "type": "IN17A025", "side": "R", "region": "vnc", "role": "drop", "nt": "ACh", "x": 0.54, "y": 0.92, "layer": "T3"},
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


def main() -> None:
    catalog = load_catalog()
    names = set(catalog.get("names") or [])

    parsed: dict[str, list[dict]] = {}
    if TYPES.exists():
        for page in TYPES.glob("*.html"):
            if page.name.endswith(".raw.html"):
                continue
            parsed[page.stem] = parse_page(page.read_text(errors="replace"), page.stem)

    nodes = {
        n["id"]: dict(n, n_cells=n.get("n_cells", 1), body_ids=[], official=n["type"] in names)
        for n in SEED_NODES
    }

    edges = []

    def add_edge(pre, post, weight, nt, evidence):
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
            }
        )

    # Bilateral optic feedforward + local inhibition
    for side in ("L", "R"):
        add_edge(f"R1-R6_{side}", f"L1_{side}", 80, "His", "optic-lobe feedforward (MaleCNS types)")
        add_edge(f"R1-R6_{side}", f"L2_{side}", 70, "His", "optic-lobe feedforward (MaleCNS types)")
        add_edge(f"R1-R6_{side}", f"L3_{side}", 55, "His", "lamina L3 pathway")
        add_edge(f"L1_{side}", f"C2_{side}", 30, "His", "lamina → C2 feedback")
        add_edge(f"C2_{side}", f"L1_{side}", 22, "GABA", "C2 inhibitory feedback")
        add_edge(f"C2_{side}", f"L2_{side}", 18, "GABA", "C2 inhibitory feedback")
        add_edge(f"L1_{side}", f"Mi1_{side}", 55, "His", "lamina → medulla")
        add_edge(f"L2_{side}", f"Mi1_{side}", 48, "His", "lamina → medulla")
        add_edge(f"L2_{side}", f"Tm3_{side}", 42, "His", "lamina → Tm3")
        add_edge(f"L3_{side}", f"Tm3_{side}", 36, "His", "L3 → Tm3")
        add_edge(f"Mi1_{side}", f"T4a_{side}", 42, "ACh", "medulla → lobula plate motion")
        add_edge(f"Tm3_{side}", f"T4b_{side}", 38, "ACh", "Tm3 → T4b motion")
        add_edge(f"Mi1_{side}", f"Mi4_{side}", 20, "ACh", "Mi1 → Mi4")
        add_edge(f"Mi4_{side}", f"T4a_{side}", 24, "GABA", "Mi4 motion gain control")
        add_edge(f"L2_{side}", f"T5a_{side}", 38, "His", "lamina/lobula motion pathway")
        add_edge(f"T4a_{side}", f"LC10a_{side}", 36, "ACh", "motion → object feature")
        add_edge(f"T4b_{side}", f"LC10b_{side}", 32, "ACh", "motion → LC10b")
        add_edge(f"T5a_{side}", f"LC10a_{side}", 28, "ACh", "motion → object feature")
        add_edge(f"T5a_{side}", f"LC6_{side}", 22, "ACh", "motion → LC6")
        add_edge(f"Mi1_{side}", f"MeTu1_{side}", 26, "ACh", "medulla → MeTu relay")
        add_edge(f"Tm3_{side}", f"MeTu1_{side}", 20, "ACh", "Tm3 → MeTu")
        add_edge(f"LC10a_{side}", f"LoVP92_{side}", 24, "ACh", "VPN convergence")
        add_edge(f"LC10b_{side}", f"LoVP92_{side}", 18, "ACh", "LC10b → LoVP92")
        add_edge(f"LC6_{side}", f"LoVP11_{side}", 16, "ACh", "LC6 → LoVP11")
        add_edge(f"MeTu1_{side}", f"LoVP92_{side}", 14, "ACh", "MeTu → VPN")
        add_edge(f"LoVP11_{side}", f"LoVP92_{side}", 12, "ACh", "VPN local mix")

    # Paper: LoVP92 activates VES200m bilaterally; VES200m inhibits DNg13 ipsilaterally.
    add_edge("LoVP92_L", "VES200m_L", 90, "ACh", "Cell paper frontal VPN→VES200m")
    add_edge("LoVP92_R", "VES200m_R", 90, "ACh", "Cell paper frontal VPN→VES200m")
    add_edge("LoVP92_L", "VES200m_R", 40, "ACh", "Cell paper bilateral VES200m")
    add_edge("LoVP92_R", "VES200m_L", 40, "ACh", "Cell paper bilateral VES200m")

    # VPN → AOTU / central integrators (bilateral)
    for side in ("L", "R"):
        add_edge(f"LoVP92_{side}", f"AOTU019_{side}", 40, "ACh", "VPN → AOTU")
        add_edge(f"MeTu1_{side}", f"AOTU019_{side}", 28, "ACh", "MeTu → AOTU")
        add_edge(f"AOTU019_{side}", f"CB0244_{side}", 34, "ACh", "AOTU → CB0244")
        add_edge(f"AOTU019_{side}", f"LAL073_{side}", 30, "ACh", "AOTU → LAL")
        add_edge(f"LoVP92_{side}", f"CB0244_{side}", 36, "ACh", "VPN → central integrator")
        add_edge(f"LoVP92_{side}", f"LAL073_{side}", 28, "ACh", "VPN → LAL")
        add_edge(f"LoVP11_{side}", f"SMP108_{side}", 18, "ACh", "VPN → SMP")
        add_edge(f"SMP108_{side}", f"GNG532_{side}", 22, "ACh", "SMP → GNG")
        add_edge(f"CB0244_{side}", f"GNG532_{side}", 26, "ACh", "proto → GNG")
        add_edge(f"GNG532_{side}", f"DNg97_{side}", 24, "ACh", "GNG → DNg97")
        add_edge(f"CB0244_{side}", f"DNp13_{side}", 20, "ACh", "proto → DNp13")

    # Official DNg13_L upstream/downstream, mirrored onto both hemispheres.
    dng = parsed.get("DNg13_L") or []
    # partner → (ipsi node type, how it maps onto L / R DNg13)
    # LAL073 in the L table is contralateral (R→L); mirror as L→R.
    wanted_in = {
        "VES200m": ("VES200m", "ipsi"),
        "CB0244": ("CB0244", "ipsi"),
        "LAL073": ("LAL073", "contra"),
        "GNG532": ("GNG532", "ipsi"),
        "DNg97": ("DNg97", "ipsi"),
    }
    wanted_out = {
        "IN16B045": "IN16B045",
        "IN19A016": "IN19A016",
        "IN17A025": "IN17A025",
    }
    for e in dng:
        if e["kind"] == "in" and e["partner"] in wanted_in:
            type_name, mode = wanted_in[e["partner"]]
            for hemi in ("L", "R"):
                pre_side = hemi if mode == "ipsi" else ("R" if hemi == "L" else "L")
                pre = f"{type_name}_{pre_side}"
                post = f"DNg13_{hemi}"
                if hemi == "L":
                    nodes[pre]["n_cells"] = e["n_cells"]
                    nodes[pre]["body_ids"] = e["body_ids"]
                    nodes[pre]["nt"] = e["nt"]
                add_edge(pre, post, e["weight"], e["nt"], "Cell Type Explorer DNg13_L upstream (bilateral mirror)")
        if e["kind"] == "out" and e["partner"] in wanted_out:
            type_name = wanted_out[e["partner"]]
            for hemi in ("L", "R"):
                post = f"{type_name}_{hemi}"
                if hemi == "R":
                    nodes[post]["n_cells"] = e["n_cells"]
                    nodes[post]["body_ids"] = e["body_ids"]
                add_edge(f"DNg13_{hemi}", post, e["weight"], "ACh", "Cell Type Explorer DNg13_L downstream (bilateral)")
                # weaker cross to opposite VNC
                add_edge(
                    f"DNg13_{hemi}",
                    f"{type_name}_{'R' if hemi == 'L' else 'L'}",
                    max(12, e["weight"] // 3),
                    "ACh",
                    "cross-hemisphere VNC residual",
                )

    dna = parsed.get("DNa02") or []
    if dna:
        top_in = [e for e in dna if e["kind"] == "in"][:1]
        if top_in:
            w = max(20, top_in[0]["weight"])
            add_edge("CB0244_L", "DNa02", w, top_in[0]["nt"], "DNa02 upstream (scaled)")
            add_edge("CB0244_R", "DNa02", w, top_in[0]["nt"], "DNa02 upstream (R mirror)")
            add_edge("LAL073_L", "DNa02", 18, "Glu", "DNa02 LAL mix")
            add_edge("LAL073_R", "DNa02", 18, "Glu", "DNa02 LAL mix")
        add_edge("DNa02", "IN17A025_L", 28, "ACh", "DNa02 → VNC")
        add_edge("DNa02", "IN17A025_R", 28, "ACh", "DNa02 → VNC")

    # Extra DN facilitation only if explorer table did not already wire it.
    existing = {(e["pre"], e["post"]) for e in edges}
    for side in ("L", "R"):
        if (f"DNg97_{side}", f"DNg13_{side}") not in existing:
            add_edge(f"DNg97_{side}", f"DNg13_{side}", 48, "ACh", "DNg97 ipsilateral facilitation")
        if (f"DNp13_{side}", f"DNg13_{side}") not in existing:
            add_edge(f"DNp13_{side}", f"DNg13_{side}", 32, "ACh", "DNp13 ipsilateral facilitation")
    # Soft left/right competition so steering does not saturate both DNs equally.
    add_edge("DNg13_L", "DNg13_R", 90, "Glu", "bilateral DN mutual inhibition")
    add_edge("DNg13_R", "DNg13_L", 90, "Glu", "bilateral DN mutual inhibition")

    uniq = {}
    for e in edges:
        key = (e["pre"], e["post"])
        prev = uniq.get(key)
        if prev is None or e["weight"] > prev["weight"]:
            uniq[key] = e
    edges = list(uniq.values())

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

    payload = {
        "source": {
            "name": "Male CNS connectome v1.0",
            "dataset": "male-cns:v1.0",
            "uuid": "4b2087c0fbe046bfaf0d60bc970e3e5d",
            "neurons": 166700,
            "synapses": 125_000_000,
            "types_in_catalog": len(names),
            "blog": "https://research.google/blog/a-connectomics-milestone-mapping-the-complete-male-fruit-fly-brain/",
            "portal": "https://male-cns.janelia.org/",
            "neuprint": "https://neuprint.janelia.org/",
            "codex": "https://codex.flywire.ai/",
            "neuroglancer": "https://neuroglancer-demo.appspot.com/#!gs://flyem-male-cns/v1.0/male-cns-v1.0.jso",
            "explorer": "https://reiserlab.github.io/celltype-explorer-drosophila-male-cns/",
            "annotations": "gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather",
            "license": "CC-BY",
            "note": (
                "Expanded playable subgraph of the official visual–motor / steering motif "
                "(R1–R6 … L1/L2/L3 → Mi1/Tm3 → T4/T5 → LC10/LC6 → LoVP92 → "
                "AOTU/CB0244/LAL → VES200m ⊣ DNg13 → VNC), bilaterally mirrored. "
                "Real type names and DNg13 synapse counts from MaleCNS Cell Type Explorer. "
                "Not a full 166k-neuron simulation."
            ),
        },
        "nodes": ordered_nodes,
        "edges": edges,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT}  nodes={len(nodes)} edges={len(edges)} catalog={len(names)}")


if __name__ == "__main__":
    main()
