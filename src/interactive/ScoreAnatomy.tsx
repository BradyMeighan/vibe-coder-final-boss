// Stacked bar showing what makes up our 0.22878 score:
//   100·seg + √(10·pose) + 25·rate
// Each bar segment is hoverable and shows the exact contribution.
// Insight: rate dominates ~57% of our score, even though seg gets the 100x weight.

import { useState } from "react";

const SEG = 0.000272;
const POSE = 0.000495;
const RATE = 197160 / 37545489;

const SEG_TERM = 100 * SEG;                       // 0.0272
const POSE_TERM = Math.sqrt(10 * POSE);           // 0.0703
const RATE_TERM = 25 * RATE;                      // 0.1313
const TOTAL = SEG_TERM + POSE_TERM + RATE_TERM;   // 0.22878

const SEGMENTS = [
  {
    key: "seg",
    label: "segnet",
    color: "#51FF00",
    value: SEG_TERM,
    formula: "100 · seg_dist",
    explain: "100 × 0.000272 = 0.0272. SegNet pixel-class disagreements between original and reconstructed frame 2.",
  },
  {
    key: "pose",
    label: "posenet",
    color: "#FFD93D",
    value: POSE_TERM,
    formula: "√(10 · pose_dist)",
    explain: "√(10 × 0.000495) = 0.0703. PoseNet ego-motion MSE on the (frame 1, frame 2) input pair.",
  },
  {
    key: "rate",
    label: "rate",
    color: "#FF5DAA",
    value: RATE_TERM,
    formula: "25 · (archive / original)",
    explain: "25 × (197,160 / 37,545,489) = 0.1313. Just shipping the bytes. Linear, every saved byte = 6.7 × 10⁻⁷ score.",
  },
];

export default function ScoreAnatomy() {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="not-prose space-y-4">
      <div className="flex items-baseline justify-between mono text-[11px] uppercase tracking-[0.2em] text-white/55">
        <span>final score = 0.22878</span>
        <span>rate dominates {Math.round((RATE_TERM / TOTAL) * 100)}%</span>
      </div>

      {/* Stacked bar */}
      <div className="relative w-full h-12 bg-white/5 border border-white/15 flex overflow-hidden">
        {SEGMENTS.map((s) => {
          const widthPct = (s.value / TOTAL) * 100;
          const isHover = hover === s.key;
          return (
            <button
              key={s.key}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(isHover ? null : s.key)}
              style={{
                width: `${widthPct}%`,
                backgroundColor: s.color,
                opacity: hover === null || isHover ? 1 : 0.35,
              }}
              className="relative h-full transition-opacity duration-150 flex items-center justify-center group"
            >
              <span
                className="mono text-[11px] font-bold"
                style={{ color: "#000" }}
              >
                {s.value.toFixed(4)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        {SEGMENTS.map((s) => {
          const isHover = hover === s.key;
          const pct = (s.value / TOTAL) * 100;
          return (
            <div
              key={s.key}
              className={`p-3 border transition-all ${
                isHover ? "border-white/40 bg-white/5" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3"
                  style={{ backgroundColor: s.color }}
                />
                <div className="mono text-[10px] uppercase tracking-[0.25em] text-white/55">
                  {s.label}
                </div>
              </div>
              <div className="text-white text-[15px] font-semibold">
                {s.value.toFixed(4)}{" "}
                <span className="text-white/40 text-[12px] mono">
                  ({pct.toFixed(0)}%)
                </span>
              </div>
              <div className="mt-1 mono text-[10.5px] text-comma-green">
                {s.formula}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      <div className="min-h-[60px] p-4 border border-white/10 bg-white/[0.02]">
        {hover ? (
          <p className="text-white/80 text-[13.5px] leading-relaxed">
            {SEGMENTS.find((s) => s.key === hover)!.explain}
          </p>
        ) : (
          <p className="text-white/45 text-[12.5px] mono">
            hover or tap a segment to see what it really costs
          </p>
        )}
      </div>
    </div>
  );
}
