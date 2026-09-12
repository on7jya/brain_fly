#!/usr/bin/env python3
"""Build alternate dataset circuits + ♀/♂ comparison + pathways/MAOL/MANC stubs.

Reads MaleCNS circuit_malecns.json and optional FAFB CSVs under data/raw/fafb/.
Writes:
  data/processed/circuit_fafb.json      (real weights if CSV present, else scaffold)
  data/processed/circuit_banc.json      (stub / scaled scaffold)
  data/processed/circuit_manc.json      (VNC-only stub from MaleCNS VNC nodes)
  data/processed/circuit_maol.json      (optic-lobe teaching stub)
  data/processed/compare_fafb_mcns.json
  data/processed/nt_palette.json
  data/processed/pathways.json
"""

from __future__ import annotations

import csv
import gzip
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_FAFB = ROOT / "data" / "raw" / "fafb"
PROC = ROOT / "data" / "processed"

NT_SIGN = {"ACh": 1, "GABA": -1, "Glu": -1, "His": 1, "OA": 1, "DA": 1, "5HT": 1, "unk": 1, "unc": 1}

# Literature / public-ish relative scaling ♀ FAFB vs ♂ MCNS for shared optic types
# Used only when real FAFB CSV is unavailable (documented in meta).
FAFB_SCALE = {
    "R1-R6": 0.95,
    "L1": 1.05,
    "L2": 1.0,
    "L3": 0.9,
    "Mi1": 1.1,
    "Tm3": 1.05,
    "T4a": 1.15,
    "T4b": 1.1,
    "T5a": 1.2,
    "LC10a": 0.85,
    "LC10b": 0.9,
    "LC6": 0.8,
    "LoVP92": 0.7,  # male-biased courtship / frontal VPN emphasis
    "VES200m": 0.65,
    "DNg13": 0.75,
    "DNa02": 0.9,
}


def load_mcns() -> dict:
    path = PROC / "circuit_malecns.json"
    if not path.exists():
        path = PROC / "circuit.json"
    return json.loads(path.read_text())


def scale_circuit(base: dict, *, dataset: str, name: str, sex: str, scale_fn, note: str, extra_source: dict | None = None) -> dict:
    nodes = []
    for n in base["nodes"]:
        nn = dict(n)
        # FAFB has no VNC — drop or keep as ghost depending on dataset
        nodes.append(nn)
    edges = []
    for e in base["edges"]:
        pre_t = next((n["type"] for n in base["nodes"] if n["id"] == e["pre"]), "")
        post_t = next((n["type"] for n in base["nodes"] if n["id"] == e["post"]), "")
        s = scale_fn(pre_t, post_t, e)
        ee = dict(e)
        ee["weight"] = max(1, int(round(e["weight"] * s)))
        ee["weight_source"] = e.get("weight_source", "scaffold") + "+fafb_scale" if dataset == "fafb" else "scaffold"
        ee["evidence"] = f"{e.get('evidence', '')} · {dataset} scaffold scale {s:.2f}".strip(" ·")
        edges.append(ee)
    src = dict(base.get("source") or {})
    src.update(
        {
            "name": name,
            "dataset": dataset,
            "sex": sex,
            "codex": f"https://codex.flywire.ai/?dataset={dataset}",
            "codex_dataset": dataset,
            "scaffold": True,
            "note": note,
        }
    )
    if extra_source:
        src.update(extra_source)
    return {
        "source": src,
        "nodes": nodes,
        "edges": edges,
        "pathways": base.get("pathways") or [],
    }


def try_load_fafb_type_weights() -> dict[tuple[str, str], dict] | None:
    """If connections + cell types CSVs exist, aggregate type→type synapse counts."""
    conn = RAW_FAFB / "connections_princeton.csv.gz"
    if not conn.exists():
        conn = RAW_FAFB / "connections_princeton_no_threshold.csv.gz"
    types = RAW_FAFB / "consolidated_cell_types.csv.gz"
    if not conn.exists() or not types.exists():
        return None

    root_to_type: dict[str, str] = {}
    opener = gzip.open if str(types).endswith(".gz") else open
    with opener(types, "rt") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row.get("root_id") or row.get("pt_root_id") or row.get("id")
            ctype = row.get("primary_type") or row.get("cell_type") or row.get("type")
            if rid and ctype:
                root_to_type[str(rid)] = ctype

    agg: dict[tuple[str, str], dict] = {}
    opener = gzip.open if str(conn).endswith(".gz") else open
    with opener(conn, "rt") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i > 5_000_000:
                break
            pre = root_to_type.get(str(row.get("pre_root_id") or row.get("pre")))
            post = root_to_type.get(str(row.get("post_root_id") or row.get("post")))
            if not pre or not post:
                continue
            w = int(float(row.get("syn_count") or row.get("weight") or row.get("count") or 1))
            nt = row.get("nt_type") or row.get("neurotransmitter") or "unk"
            key = (pre, post)
            cur = agg.get(key)
            if cur is None:
                agg[key] = {"weight": w, "nt": nt}
            else:
                cur["weight"] += w
    return agg


def build_fafb_from_csv(base: dict, agg: dict[tuple[str, str], dict]) -> dict:
    type_of = {n["id"]: n["type"] for n in base["nodes"]}
    edges = []
    hits = 0
    for e in base["edges"]:
        pre_t, post_t = type_of.get(e["pre"], ""), type_of.get(e["post"], "")
        real = agg.get((pre_t, post_t))
        ee = dict(e)
        if real:
            ee["weight"] = int(real["weight"])
            ee["nt"] = real.get("nt") or e.get("nt")
            ee["sign"] = NT_SIGN.get(ee["nt"], e.get("sign", 1))
            ee["weight_source"] = "fafb_csv"
            ee["evidence"] = "FAFB Codex connections aggregated by cell type"
            hits += 1
        else:
            s = FAFB_SCALE.get(pre_t, 0.9) * 0.5 + FAFB_SCALE.get(post_t, 0.9) * 0.5
            ee["weight"] = max(1, int(round(e["weight"] * s)))
            ee["weight_source"] = "fafb_scaffold"
            ee["evidence"] = "FAFB scaffold (pair missing in CSV aggregate)"
        edges.append(ee)

    # Drop pure VNC motor if desired? Keep for gameplay continuity but mark.
    nodes = [dict(n, dataset_note="FAFB has no native VNC — VNC nodes are gameplay stubs") if n["region"] == "vnc" else dict(n) for n in base["nodes"]]
    src = dict(base["source"])
    src.update(
        {
            "name": "FAFB v783 (FlyWire ♀ brain)",
            "dataset": "fafb",
            "sex": "female",
            "neurons": 139255,
            "codex": "https://codex.flywire.ai/?dataset=fafb",
            "codex_dataset": "fafb",
            "scaffold": False,
            "fafb_csv_hits": hits,
            "note": "Female FlyWire brain weights where CSV available; VNC nodes are gameplay stubs (FAFB is brain-only).",
            "neuroglancer": "https://neuroglancer-demo.appspot.com/#!gs://flywire_fafb_public/",
        }
    )
    return {"source": src, "nodes": nodes, "edges": edges, "pathways": base.get("pathways") or []}


def build_comparison(mcns: dict, fafb: dict) -> dict:
    """Per-type total synaptic weight comparison for shared circuit types."""
    def type_weights(circ: dict) -> dict[str, float]:
        tw: dict[str, float] = {}
        type_of = {n["id"]: n["type"] for n in circ["nodes"]}
        for e in circ["edges"]:
            for t in (type_of.get(e["pre"]), type_of.get(e["post"])):
                if not t:
                    continue
                tw[t] = tw.get(t, 0) + e["weight"]
        return tw

    m = type_weights(mcns)
    f = type_weights(fafb)
    types = sorted(set(m) | set(f))
    rows = []
    for t in types:
        rows.append(
            {
                "type": t,
                "male_mcns": round(m.get(t, 0), 1),
                "female_fafb": round(f.get(t, 0), 1),
                "ratio_f_over_m": round((f.get(t, 0) + 1) / (m.get(t, 0) + 1), 3),
            }
        )
    rows.sort(key=lambda r: -(r["male_mcns"] + r["female_fafb"]))
    return {
        "title": "♀ FAFB ↔ ♂ MaleCNS — веса по типам в игровом контуре",
        "fafb_scaffold": bool(fafb.get("source", {}).get("scaffold")),
        "auth_blocker": _fafb_auth_note(),
        "rows": rows[:40],
    }


def _fafb_auth_note() -> str:
    """Short RU note for UI when FAFB CSV is missing; empty if data is present."""
    types = RAW_FAFB / "consolidated_cell_types.csv.gz"
    conn = RAW_FAFB / "connections_princeton.csv.gz"
    if not conn.exists():
        conn = RAW_FAFB / "connections_princeton_no_threshold.csv.gz"
    if types.exists() and conn.exists() and types.stat().st_size > 1000 and conn.stat().st_size > 1000:
        return ""
    status = RAW_FAFB / "STATUS.json"
    if status.exists():
        try:
            st = json.loads(status.read_text())
            if st.get("auth_required") or st.get("note_ru") or st.get("note"):
                return (
                    st.get("note_ru")
                    or st.get("note")
                    or "Нужен вход Codex или CSV в data/raw/fafb/ — сейчас scaffold."
                )
        except json.JSONDecodeError:
            pass
    return "FAFB CSV нет — scaffold. См. scripts/fetch_fafb.py (публичное зеркало или cookie)."


def build_manc_vnc(mcns: dict) -> dict:
    nodes = [dict(n) for n in mcns["nodes"] if n["region"] in ("vnc", "descending")]
    ids = {n["id"] for n in nodes}
    edges = [dict(e) for e in mcns["edges"] if e["pre"] in ids and e["post"] in ids]
    # re-layout VNC vertically
    for i, n in enumerate(nodes):
        n["x"] = 0.35 + (0.3 if n.get("side") == "R" else 0.0) + (0.15 if n.get("side") == "B" else 0)
        n["y"] = 0.2 + (i % 12) * 0.06
    src = {
        "name": "MANC VNC-only (stub from MaleCNS DN/VNC)",
        "dataset": "manc",
        "sex": "male",
        "scaffold": True,
        "codex": "https://codex.flywire.ai/?dataset=manc",
        "codex_dataset": "manc",
        "portal": "https://neuprint.janelia.org/?dataset=manc%3Av1.0",
        "limitation": (
            "Full MANC connectome bulk tables are not bundled. This mode filters "
            "descending + VNC nodes from the MaleCNS playable circuit as a teaching stub. "
            "Browse MANC on neuPrint / Codex for the real ventral nerve cord."
        ),
        "note": "VNC-only teaching stub",
        "neuroglancer": "https://neuprint.janelia.org/?dataset=manc%3Av1.0",
    }
    return {"source": src, "nodes": nodes, "edges": edges, "pathways": []}


def build_maol(mcns: dict) -> dict:
    nodes = [dict(n) for n in mcns["nodes"] if n["region"] == "optic"]
    ids = {n["id"] for n in nodes}
    edges = [dict(e) for e in mcns["edges"] if e["pre"] in ids and e["post"] in ids]
    for n in nodes:
        n["y"] = 0.15 + (n["y"] - 0.14) * 1.6
    src = {
        "name": "MAOL mini optic lobe (teaching)",
        "dataset": "maol",
        "sex": "male",
        "scaffold": True,
        "codex": "https://codex.flywire.ai/?dataset=maol",
        "codex_dataset": "maol",
        "portal": "https://codex.flywire.ai/?dataset=maol",
        "limitation": (
            "MAOL (Male Adult Optic Lobe) full release is not downloaded here. "
            "This mode keeps only optic-lobe nodes from the MaleCNS circuit for teaching "
            "columnar / lamina–medulla–lobula flow."
        ),
        "note": "Optic-lobe teaching subset",
        "neuroglancer": "https://codex.flywire.ai/?dataset=maol",
    }
    pathways = [
        {
            "id": "column_feedforward",
            "label": "колонка R1–R6→L→Mi/Tm→T4/T5",
            "nodes": [n["id"] for n in nodes if n["type"] in ("R1-R6", "L1", "L2", "Mi1", "Tm3", "T4a", "T5a")],
            "note": "canonical optic column teaching path",
        }
    ]
    return {"source": src, "nodes": nodes, "edges": edges, "pathways": pathways}


def build_banc(mcns: dict) -> dict:
    def scale(pre_t, post_t, e):
        return 0.92

    return scale_circuit(
        mcns,
        dataset="banc",
        name="BANC (scaffold)",
        sex="mixed",
        scale_fn=scale,
        note=(
            "BANC bulk download also goes through Codex (login). "
            "Scaffold reuses MaleCNS topology with mild weight scaling until CSVs are placed in data/raw/banc/."
        ),
        extra_source={
            "codex": "https://codex.flywire.ai/?dataset=banc",
            "limitation": "No local BANC CSV — scaffold only.",
            "neurons": None,
        },
    )


def nt_palette() -> dict:
    return {
        "ACh": {"sign": 1, "color": "#4ade80", "label": "ацетилхолин (возб.)"},
        "GABA": {"sign": -1, "color": "#fb7185", "label": "GABA (торм.)"},
        "Glu": {"sign": -1, "color": "#f472b6", "label": "глутамат (торм. в мухе)"},
        "His": {"sign": 1, "color": "#a78bfa", "label": "гистамин"},
        "OA": {"sign": 1, "color": "#fbbf24", "label": "октопамин"},
        "DA": {"sign": 1, "color": "#38bdf8", "label": "дофамин"},
        "5HT": {"sign": 1, "color": "#f9a8d4", "label": "серотонин"},
        "unk": {"sign": 1, "color": "#94a3b8", "label": "неизвестно"},
        "unc": {"sign": 1, "color": "#94a3b8", "label": "неясно"},
    }


def main() -> None:
    mcns = load_mcns()
    agg = try_load_fafb_type_weights()
    if agg:
        fafb = build_fafb_from_csv(mcns, agg)
        print(f"FAFB from CSV aggregates: {len(agg)} type pairs")
    else:
        def scale(pre_t, post_t, e):
            return (FAFB_SCALE.get(pre_t, 0.9) + FAFB_SCALE.get(post_t, 0.9)) / 2

        fafb = scale_circuit(
            mcns,
            dataset="fafb",
            name="FAFB v783 scaffold (♀)",
            sex="female",
            scale_fn=scale,
            note=(
                "Scaffolded female weight set: MaleCNS topology × public/literature-ish scales. "
                "Replace by running scripts/fetch_fafb.py after Codex login, then rebuild."
            ),
            extra_source={
                "neurons": 139255,
                "synapses": None,
                "neuroglancer": "https://codex.flywire.ai/?dataset=fafb",
                "auth_blocker": _fafb_auth_note() or "Codex FAFB CSV typically needs Google login.",
            },
        )
        print("FAFB scaffold (no CSV)")

    banc = build_banc(mcns)
    manc = build_manc_vnc(mcns)
    maol = build_maol(mcns)
    compare = build_comparison(mcns, fafb)
    pathways = {
        "source": "Codex Pathways–inspired motifs over local circuit nodes",
        "items": mcns.get("pathways") or [],
    }

    PROC.mkdir(parents=True, exist_ok=True)
    for name, obj in [
        ("circuit_fafb.json", fafb),
        ("circuit_banc.json", banc),
        ("circuit_manc.json", manc),
        ("circuit_maol.json", maol),
        ("compare_fafb_mcns.json", compare),
        ("nt_palette.json", nt_palette()),
        ("pathways.json", pathways),
    ]:
        (PROC / name).write_text(json.dumps(obj, indent=2))
        print("Wrote", PROC / name)


if __name__ == "__main__":
    main()
