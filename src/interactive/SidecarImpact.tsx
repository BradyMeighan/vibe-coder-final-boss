// Interactive viewer for sidecar's actual pixel-level impact.
//
// The sidecar's effect is microscopic at full resolution (often only a handful
// of SegNet output pixels change per pair) but is what moves our score.
// This viewer makes those tiny changes visible by:
//   - letting you toggle "with / without sidecar"
//   - letting you switch view modes: raw frame / SegNet class colors / red wash
//     where SegNet disagrees with the ground truth
//   - showing the count of fixed/hurt pixels and which corrections were
//     actually applied
//
// The point: see the literal pixels that flipped from wrong→right.

import { useEffect, useState } from "react";

const BASE = "/writeup_assets/sidecar_impact";

type Correction =
  | { type: "x2"; n: number }
  | { type: "cmaes"; n: number }
  | { type: "pattern"; n: number }
  | { type: "pose"; vals: number[] }
  | { type: "warp"; qx: number; qy: number };

type PairMeta = {
  pair: number;
  wrong_pixels_bare: number;
  wrong_pixels_side: number;
  fixed_pixels: number;
  hurt_pixels: number;
  net_fixed: number;
  total_changed: number;
  corrections: Correction[];
};

type Stats = {
  n_top_pairs: number;
  total_pairs: number;
  class_names: string[];
  class_colors: number[][];
  aggregate: {
    mean_wrong_bare: number;
    mean_wrong_side: number;
    total_pixels_per_frame: number;
    pairs_helped: number;
    pairs_hurt: number;
    pairs_unchanged: number;
  };
  pairs: PairMeta[];
};

type View = "raw" | "seg" | "disagreement";

export default function SidecarImpact() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pairIdx, setPairIdx] = useState(0);
  const [withSidecar, setWithSidecar] = useState(true);
  const [view, setView] = useState<View>("disagreement");

  useEffect(() => {
    fetch(`${BASE}/_stats.json`)
      .then((r) => r.json())
      .then(setStats)
      .catch((e) => console.error(e));
  }, []);

  if (!stats) {
    return (
      <div className="not-prose text-white/40 mono text-[12px] p-4">
        loading sidecar data…
      </div>
    );
  }

  const meta = stats.pairs[pairIdx];

  const imgFor = (mode: View, side: "bare" | "side"): string => {
    if (mode === "raw") return `${BASE}/${side === "bare" ? "bare" : "sidecar"}/${meta.pair}.jpg`;
    if (mode === "seg") return `${BASE}/${side === "bare" ? "segbare" : "segside"}/${meta.pair}.jpg`;
    return `${BASE}/${side === "bare" ? "segdiff_bare" : "segdiff_side"}/${meta.pair}.jpg`;
  };

  const currentImg = withSidecar ? imgFor(view, "side") : imgFor(view, "bare");
  const totalPx = stats.aggregate.total_pixels_per_frame;

  return (
    <div className="not-prose space-y-4">
      {/* Header strip — context */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="pixels SegNet outputs"
          value={`${(totalPx / 1000).toFixed(0)}k`}
          sub="per frame"
        />
        <Stat
          label="wrong before sidecar"
          value={meta.wrong_pixels_bare.toLocaleString()}
          sub={`${((meta.wrong_pixels_bare / totalPx) * 100).toFixed(2)}% of frame`}
        />
        <Stat
          label="wrong after sidecar"
          value={meta.wrong_pixels_side.toLocaleString()}
          sub={`${((meta.wrong_pixels_side / totalPx) * 100).toFixed(2)}% of frame`}
        />
        <Stat
          label="net pixels fixed"
          value={`${meta.net_fixed >= 0 ? "+" : ""}${meta.net_fixed}`}
          sub={`fixed ${meta.fixed_pixels} • hurt ${meta.hurt_pixels}`}
          highlight={meta.net_fixed > 0 ? "good" : meta.net_fixed < 0 ? "bad" : "neutral"}
        />
      </div>

      {/* Main image */}
      <div className="border border-white/15 bg-black/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55">
            {view === "raw"
              ? "MODEL OUTPUT (frame 2)"
              : view === "seg"
              ? "SEGNET CLASS PREDICTION"
              : "RED = SEGNET DISAGREES WITH GROUND-TRUTH SEGNET"}
          </div>
          <div className="mono text-[11px] text-comma-green">
            {withSidecar ? "with sidecar" : "without sidecar"}
          </div>
        </div>
        <img
          src={currentImg}
          alt={`pair ${meta.pair}`}
          className="w-full block rounded-sm"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Big toggle: with/without sidecar */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setWithSidecar(false)}
          className={`p-3 border mono text-[12px] uppercase tracking-widest transition-all ${
            !withSidecar
              ? "border-comma-green text-comma-green bg-comma-green/10"
              : "border-white/15 text-white/55 hover:border-white/35"
          }`}
        >
          [ without sidecar ]
        </button>
        <button
          onClick={() => setWithSidecar(true)}
          className={`p-3 border mono text-[12px] uppercase tracking-widest transition-all ${
            withSidecar
              ? "border-comma-green text-comma-green bg-comma-green/10"
              : "border-white/15 text-white/55 hover:border-white/35"
          }`}
        >
          [ with sidecar ]
        </button>
      </div>

      {/* View mode toggle */}
      <div className="grid grid-cols-3 gap-2">
        {(["raw", "seg", "disagreement"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`p-2 border mono text-[11px] uppercase tracking-widest transition-all ${
              view === v
                ? "border-white text-white"
                : "border-white/15 text-white/55 hover:border-white/35"
            }`}
          >
            {v === "raw" ? "raw frame" : v === "seg" ? "segnet output" : "disagreement"}
          </button>
        ))}
      </div>

      {/* Pair selector + corrections */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,2fr] gap-3">
        <div className="border border-white/15 p-3 bg-black/30">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">
            choose a pair (sorted by net pixels fixed)
          </div>
          <div className="grid grid-cols-5 gap-1.5 max-h-[140px] overflow-auto">
            {stats.pairs.map((p, i) => {
              const active = i === pairIdx;
              return (
                <button
                  key={p.pair}
                  onClick={() => setPairIdx(i)}
                  className={`mono text-[11px] py-1 border transition-colors ${
                    active
                      ? "border-comma-green text-comma-green bg-comma-green/10"
                      : "border-white/10 text-white/65 hover:border-white/30"
                  }`}
                >
                  {p.pair}
                </button>
              );
            })}
          </div>
          <div className="mt-3 mono text-[10px] text-white/45 leading-relaxed">
            top {stats.n_top_pairs} of {stats.total_pairs} pairs (the ones whose
            SegNet output the sidecar moved most). of the full set, {stats.aggregate.pairs_helped} pairs
            were helped, {stats.aggregate.pairs_hurt} were hurt by the
            class-boundary noise the corrections introduce, and{" "}
            {stats.aggregate.pairs_unchanged} were unchanged.
          </div>
        </div>

        <div className="border border-white/15 p-3 bg-black/30">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">
            what the sidecar applied to pair {meta.pair}
          </div>
          {meta.corrections.length === 0 ? (
            <div className="text-white/40 text-[13px]">no corrections shipped for this pair</div>
          ) : (
            <ul className="space-y-1.5">
              {meta.corrections.map((c, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3 mono text-[12.5px] text-white/85"
                >
                  <span className="inline-block w-[68px] text-comma-green uppercase tracking-widest text-[10px]">
                    {c.type}
                  </span>
                  <span>{describeCorrection(c)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 mono text-[10px] text-white/45 leading-relaxed">
            net SegNet-pixel change vs bare model: <span className="text-white/85">{meta.total_changed}</span> changed
            ·  <span className="text-comma-green">{meta.fixed_pixels}</span> fixed ·{" "}
            <span className="text-pink-400">{meta.hurt_pixels}</span> hurt
          </div>
        </div>
      </div>
    </div>
  );
}

function describeCorrection(c: Correction): string {
  if (c.type === "x2") return `${c.n} two-pixel mask block flips`;
  if (c.type === "cmaes") return `${c.n} single-pixel mask flips (CMA-ES search)`;
  if (c.type === "pattern") return `${c.n} small-pattern mask flips (3×3 / 1×4 / 4×1 / 2×2)`;
  if (c.type === "pose") return `pose vector deltas: [${c.vals.map((v) => v.toString()).join(", ")}] (int8 × per-dim scale)`;
  if (c.type === "warp") return `frame-1 sub-pixel translation: (qx=${c.qx}, qy=${c.qy}) → ${(c.qx / 10).toFixed(1)}px, ${(c.qy / 10).toFixed(1)}px`;
  return JSON.stringify(c);
}

function Stat({
  label,
  value,
  sub,
  highlight = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: "good" | "bad" | "neutral";
}) {
  const valColor =
    highlight === "good" ? "text-comma-green" : highlight === "bad" ? "text-pink-400" : "text-white";
  return (
    <div className="border border-white/10 p-3 bg-black/30">
      <div className="mono text-[10px] uppercase tracking-widest text-white/45 mb-1">{label}</div>
      <div className={`text-[20px] font-bold mono leading-none ${valColor}`}>{value}</div>
      {sub && <div className="mt-1 mono text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}
