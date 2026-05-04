// Demonstrates: the model literally PAINTS from the mask. Pick a pair, pick a
// mask variant (original, all-road, all-sky, swap classes, no vehicles, left
// half only, etc) → see how the model output morphs.
//
// You can see specific things change:
//   - "no vehicle" → the red blob in the middle disappears
//   - "swap sky ↔ road" → the colors of the sky and road regions swap in the output
//   - "all class N" → the entire frame collapses to one palette
//   - "left half only" → the right half of the output goes uniform
//
// This is the mechanical proof that the mask is the entire scene representation.

import { useEffect, useState } from "react";

const BASE = "/writeup_assets/mask_cond";

type Variant = { key: string; label: string; desc: string };
type Meta = { pair: number; variants: Variant[] };
type Stats = {
  pairs: number[];
  class_names: string[];
  class_colors: number[][];
  meta: Meta[];
};

export default function MaskConditioning() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pairIdx, setPairIdx] = useState(0);
  const [variantKey, setVariantKey] = useState("actual");

  useEffect(() => {
    fetch(`${BASE}/_stats.json`).then((r) => r.json()).then(setStats).catch(console.error);
  }, []);

  if (!stats) {
    return <div className="not-prose text-white/40 mono text-[12px] p-4">loading mask data…</div>;
  }

  const meta = stats.meta[pairIdx];
  const pair = meta.pair;
  const variant = meta.variants.find((v) => v.key === variantKey) ?? meta.variants[0];

  const maskUrl = `${BASE}/p${pair}/mask_${variant.key}.jpg`;
  const outUrl = `${BASE}/p${pair}/output_${variant.key}.jpg`;

  return (
    <div className="not-prose space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-white/15 bg-black/40 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">
            INPUT MASK (5 classes)
          </div>
          <img
            src={maskUrl}
            alt="mask"
            className="w-full block"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        <div className="border border-white/15 bg-black/40 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">
            MODEL OUTPUT (frame 2 — what SegNet sees)
          </div>
          <img src={outUrl} alt="output" className="w-full block" />
        </div>
      </div>

      {/* Variant picker */}
      <div className="border border-white/15 p-3 bg-black/30 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55">
            mask variant
          </div>
          <div className="mono text-[11px] text-white/55">
            pair&nbsp;
            <select
              value={pairIdx}
              onChange={(e) => setPairIdx(parseInt(e.target.value))}
              className="bg-black border border-white/20 text-white px-2 py-0.5 mono text-[11px]"
            >
              {stats.meta.map((m, i) => (
                <option key={m.pair} value={i}>{m.pair}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {meta.variants.map((v) => {
            const active = v.key === variantKey;
            return (
              <button
                key={v.key}
                onClick={() => setVariantKey(v.key)}
                className={`p-2 border text-left transition-colors ${
                  active
                    ? "border-comma-green text-comma-green bg-comma-green/10"
                    : "border-white/15 text-white/65 hover:border-white/35"
                }`}
              >
                <div className="mono text-[11px] font-semibold leading-none mb-0.5">{v.label}</div>
                <div className="mono text-[9.5px] text-white/45 leading-snug">{v.desc}</div>
              </button>
            );
          })}
        </div>

        <p className="text-white/55 text-[12px] mono leading-relaxed">
          Click any variant. The mask is the model's only conditioning input besides
          the 6-dim pose vector — change a region's class label and the output paints
          the new class everywhere that region appeared. Verify: "no vehicle" wipes
          the red car blob in the middle of the output. "swap sky ↔ road" inverts
          the sky/ground palette. "all class 2" collapses everything to road.
        </p>
      </div>
    </div>
  );
}
