#!/usr/bin/env python
"""Actual PoseNet local refinement around selected qscale warps."""
from __future__ import annotations

import argparse
import csv
import lzma
import math
import os
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
os.environ.setdefault("FULL_DATA", "1")
os.environ.setdefault("CONFIG", "B")
os.environ.setdefault("MODEL_PATH", "autoresearch/colab_run/3090_run/gen_3090.pt.e80.ckpt")

from prepare import MODEL_H, MODEL_W, OUT_H, OUT_W, UNCOMPRESSED_SIZE, get_pose6  # noqa: E402
from sidecar_mask_verified import regenerate_frames_from_masks  # noqa: E402
from sidecar_stack import fast_eval, per_pair_pose_mse  # noqa: E402
from v2_c3_pose_vector import apply_pose_deltas_and_regen_full  # noqa: E402
from v2_codec_probe import encode_grouped_bitpack, verify_grouped_roundtrip  # noqa: E402
from v2_shared import State, compose_score  # noqa: E402
from v2_warp_probe import _base_grid, apply_warps_hwc, warp_chw_batch  # noqa: E402

OUTPUT_DIR = ROOT / "autoresearch" / "sidecar_results"
ARTIFACT_PATH = OUTPUT_DIR / "v2_unified_warp_only_artifacts.pt"


def grouped_bytes(art: dict, warp_rows: dict[int, dict]) -> int:
    tmp = dict(art)
    tmp["warp_rows"] = warp_rows
    raw = encode_grouped_bitpack(tmp, "delta")
    return len(lzma.compress(raw, format=lzma.FORMAT_XZ, preset=6))


def estimate_score(art: dict, base_score: dict, pose_dist: float, sidecar_bytes: int) -> float:
    fixed_bytes = base_score["rate_term"] * UNCOMPRESSED_SIZE / 25.0 - int(art["scores"]["sb_warp"])
    return base_score["seg_term"] + math.sqrt(max(0.0, 10.0 * pose_dist)) + 25.0 * (fixed_bytes + sidecar_bytes) / UNCOMPRESSED_SIZE


def eval_pose_candidates_actual(s: State, f1_hwc: torch.Tensor, f2_hwc: torch.Tensor,
                                gt_pose: torch.Tensor, candidates: list[tuple[int, int]],
                                qscale: float, grid: torch.Tensor) -> np.ndarray:
    sx = OUT_W / MODEL_W
    sy = OUT_H / MODEL_H
    params = [(qx / qscale * sx, qy / qscale * sy) for qx, qy in candidates]
    f1 = f1_hwc.to(s.device).float().permute(2, 0, 1)
    f2 = f2_hwc.to(s.device).float().permute(2, 0, 1)
    with torch.inference_mode():
        f1w = warp_chw_batch(f1, params, grid)
        f2r = f2.unsqueeze(0).expand(f1w.shape[0], -1, -1, -1)
        x = torch.stack([f1w, f2r], dim=1)
        pred = get_pose6(s.posenet, s.posenet.preprocess_input(x)).float()
        mse = (pred - gt_pose.to(s.device).float().view(1, 6)).pow(2).mean(dim=1)
    return mse.cpu().numpy()


def choose_subset(art: dict, rows: dict[int, dict], actual: dict[int, float],
                  pose_base: float, base_score: dict):
    active = [(pi, actual[pi]) for pi in rows if actual[pi] > 0 and (int(rows[pi]["qx"]) or int(rows[pi]["qy"]))]
    active.sort(key=lambda x: x[1], reverse=True)
    cur = {}
    accum = 0.0
    best_rows = {}
    best = {"k": 0, "bytes": grouped_bytes(art, {}), "score": estimate_score(art, base_score, pose_base, grouped_bytes(art, {}))}
    for k, (pi, imp) in enumerate(active, 1):
        cur[pi] = dict(rows[pi])
        cur[pi]["improve"] = imp
        accum += imp
        pose_dist = max(0.0, pose_base - accum / 600.0)
        cb = grouped_bytes(art, cur)
        score = estimate_score(art, base_score, pose_dist, cb)
        if score < float(best["score"]):
            best_rows = dict(cur)
            best = {"k": k, "bytes": cb, "score": score, "pose_dist": pose_dist}
    return best_rows, best


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selection", type=Path, default=OUTPUT_DIR / "v2_unified_warp_qscale40_selection.pt")
    ap.add_argument("--qscale", type=float, default=40.0)
    ap.add_argument("--radius", type=int, default=1)
    ap.add_argument("--tag", type=str, default="qscale40_r1")
    ap.add_argument("--use-candidates", action="store_true")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    art = torch.load(ARTIFACT_PATH, weights_only=False)
    sel = torch.load(args.selection, weights_only=False)
    if args.use_candidates and isinstance(sel, dict) and "warp_candidates" in sel:
        selected_rows = sel["warp_candidates"]
    elif isinstance(sel, dict) and "warp_rows" in sel:
        selected_rows = sel["warp_rows"]
    elif isinstance(sel, dict) and "warp_candidates" in sel:
        selected_rows = sel["warp_candidates"]
    else:
        selected_rows = sel
    s = State()
    print("Regenerating non-RGB frames...", flush=True)
    scale = torch.tensor([0.001, 0.005, 0.005, 0.001, 0.001, 0.005], device=s.device)
    if art["sel_pose"]:
        f1_new, f2_new = apply_pose_deltas_and_regen_full(
            s.gen, art["final_masks"], s.poses, art["sel_pose"], s.device, scale,
            tuple(art.get("target_dims", (1, 2, 5))))
    else:
        f1_new, f2_new = regenerate_frames_from_masks(s.gen, art["final_masks"], s.poses, s.device)
    seg_base, pose_base = fast_eval(f1_new, f2_new, s.data["val_rgb"], s.device)
    base_score = compose_score(seg_base, pose_base, s.model_bytes, int(art["scores"]["sb_base"]))
    pair_base = per_pair_pose_mse(f1_new, f2_new, s.poses, s.posenet, s.device)

    grid = _base_grid(OUT_H, OUT_W, s.device)
    refined = {}
    print(f"Refining {len(selected_rows)} selected/candidate warps with radius={args.radius}...", flush=True)
    for i, (pi, row) in enumerate(sorted(selected_rows.items()), 1):
        qx0, qy0 = int(row["qx"]), int(row["qy"])
        candidates = [
            (qx0 + dx, qy0 + dy)
            for dy in range(-args.radius, args.radius + 1)
            for dx in range(-args.radius, args.radius + 1)
            if -127 <= qx0 + dx <= 127 and -127 <= qy0 + dy <= 127
        ]
        mse = eval_pose_candidates_actual(s, f1_new[pi], f2_new[pi], s.poses[pi], candidates, args.qscale, grid)
        bi = int(np.argmin(mse))
        qx, qy = candidates[bi]
        imp = float(pair_base[pi] - mse[bi])
        r = dict(row)
        r["qx"], r["qy"] = int(qx), int(qy)
        r["dx"], r["dy"] = qx / args.qscale, qy / args.qscale
        r["improve"] = imp
        refined[int(pi)] = r
        if i % 50 == 0:
            print(f"  refined {i}/{len(selected_rows)}", flush=True)

    chosen, info = choose_subset(art, refined, {pi: float(r["improve"]) for pi, r in refined.items()}, pose_base, base_score)
    print(f"selected k={info['k']} bytes={info['bytes']} est={info['score']:.9f}", flush=True)
    f1_best = apply_warps_hwc(f1_new, chosen, qscale=args.qscale, device=s.device)
    seg, pose = fast_eval(f1_best, f2_new, s.data["val_rgb"], s.device)
    score = compose_score(seg, pose, s.model_bytes, int(info["bytes"]))
    tmp = dict(art)
    tmp["warp_rows"] = chosen
    verify_grouped_roundtrip(tmp, encode_grouped_bitpack(tmp, "delta"))
    print(
        f"full eval score={score['score']:.9f} bytes={info['bytes']} "
        f"seg={score['seg_term']:.9f} pose={score['pose_term']:.9f}",
        flush=True,
    )
    out_csv = OUTPUT_DIR / "v2_actual_warp_refine_results.csv"
    write_header = not out_csv.exists()
    with out_csv.open("a", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(["cfg", "score", "sb_lzma", "seg_term", "pose_term", "n_warp", "qscale", "radius"])
        w.writerow([args.tag, score["score"], info["bytes"], score["seg_term"], score["pose_term"], info["k"], args.qscale, args.radius])
    torch.save({"warp_rows": chosen, "best": info}, OUTPUT_DIR / f"v2_actual_warp_refine_{args.tag}_selection.pt")
    print(f"wrote {out_csv}", flush=True)


if __name__ == "__main__":
    main()
