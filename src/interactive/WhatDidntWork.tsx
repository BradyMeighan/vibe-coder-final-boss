// Interactive grid of dead-end experiments. Inspired by ph4ntom_drv's
// "failures that got us here" table — except clickable, expandable, and
// honest about the actual cost in time.

import { useState } from "react";

type Failure = {
  title: string;
  tagline: string;
  score?: string;
  hours?: string;
  category: "architecture" | "training" | "codec" | "sidecar" | "deployment";
  detail: string;
  lesson: string;
};

const FAILURES: Failure[] = [
  {
    title: "Adversarial decode at eval time",
    tagline: "Backprop through SegNet inside the inflater",
    category: "sidecar",
    detail:
      "Run gradient descent through the eval discriminators at inflate time, refining each frame in-place rather than shipping patch lists. Theoretical max possible because we know the oracles exactly.",
    lesson:
      "Killed because it requires shipping the SegNet+PoseNet weights inside archive.zip for the decoder to backprop through. Those weights would dwarf our entire archive several times over. Not feasible in the rate budget.",
  },
  {
    title: "F2 frame warps",
    tagline: "Translate frame 2 to fix SegNet boundary errors",
    category: "sidecar",
    detail:
      "Mirror of the F1 warps we shipped, but applied to frame 2. The hope was that small (qx, qy) translations could fix per-pair SegNet argmax errors the same way they fixed PoseNet errors.",
    lesson:
      "SegNet reads frame 2; PoseNet reads (frame 1, frame 2). A translation that helps SegNet immediately hurts PoseNet's geometric consistency. Net cost > gain on every pair we tested.",
  },
  {
    title: "Channel-only RGB patches",
    tagline: "Modify one color channel at one pixel",
    category: "sidecar",
    detail:
      "Sub-pixel RGB nudges as a sidecar primitive. Per-pair search over (x, y, channel, ±delta) candidates, hoping to flip individual SegNet argmax decisions cheaply.",
    lesson:
      "Net-negative on bytes for our H3 model. Most 'improvements' were within FP4 quantization noise of the model itself, so they didn't survive the dequant→requant roundtrip.",
  },
  {
    title: "INT7 / INT6 weight quantization",
    tagline: "Drop one bit, hope QAT was robust",
    category: "architecture",
    detail:
      "Tried re-quantizing post-hoc to INT7 (-127..127 → -63..63) and INT6 to shave model bytes. Theory: if QAT trained robustness at INT8, maybe it has slack at INT7.",
    lesson:
      "INT8 was a razor-thin equilibrium. INT7 wiped accuracy: score 0.0798 → 0.1788. INT6 collapsed to 0.2888. Lower-bit quant requires retraining the curriculum from scratch with that target.",
  },
  {
    title: "F1 warps on HNeRV",
    tagline: "Apply our mask-model sidecar to a different architecture",
    category: "sidecar",
    detail:
      "Tried our pixel-translation sidecar (the one that helped vibe_coder_final_boss) on top of @AaronLeslie138's HNeRV decoder. Same code path, different model.",
    lesson:
      "0/30 worst-distortion pairs benefit. HNeRV produces blurry-but-positionally-aligned output; the seg distortion comes from blur, not translation. Translations can't fix blur. Latent perturbations work instead.",
  },
  {
    title: "Putting prev pixel first in cascade",
    tagline: "Intuitive: video frames are similar to the previous frame",
    category: "codec",
    detail:
      "Reorder the codec's fail-fast cascade so the temporal predictor (same pixel previous frame) runs first instead of the spatial up/left predictors.",
    lesson:
      "Dashcam at 30+ km/h means PREV is rarely the same content. Spatial predictors win 70% of pixels; temporal wins 5%. Putting prev first cost +83 KB. The data shape, not human intuition, picks the cascade order.",
  },
  {
    title: "FP32 train, post-hoc FP4",
    tagline: "Don't worry about quantization until export",
    category: "training",
    detail:
      "Standard ML practice: train at FP32, quantize at deployment. Apply FP4 only at the final torch.save() step.",
    lesson:
      "Score exploded to ~1.5. Weights that never saw quantization noise during training have no slack for it. QAT (fake-quantize during training with straight-through gradients) is non-optional when targeting < 6 bits.",
  },
  {
    title: "Higher-qscale warp refinement",
    tagline: "Finer sub-pixel displacement quantization",
    category: "sidecar",
    detail:
      "Bumped qscale 10 → 20 → 40 (i.e., 0.05 px → 0.025 px sub-pixel resolution on F1 warps), hoping smaller-step warps would unlock better fits.",
    lesson:
      "Marginal improvements (< 0.0001 score). The model's FP4 quantization noise is bigger than 0.05 px, so finer warp granularity gets eaten by it. Diminishing returns hit fast.",
  },
];

const CATEGORY_COLORS: Record<Failure["category"], string> = {
  architecture: "border-comma-green/40 hover:border-comma-green",
  training: "border-yellow-500/40 hover:border-yellow-500",
  codec: "border-blue-400/40 hover:border-blue-400",
  sidecar: "border-pink-400/40 hover:border-pink-400",
  deployment: "border-orange-400/40 hover:border-orange-400",
};

const CATEGORY_LABEL: Record<Failure["category"], string> = {
  architecture: "ARCH",
  training: "TRAIN",
  codec: "CODEC",
  sidecar: "SIDECAR",
  deployment: "DEPLOY",
};

export default function WhatDidntWork() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="not-prose">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FAILURES.map((f, i) => {
          const open = active === i;
          return (
            <button
              key={i}
              onClick={() => setActive(open ? null : i)}
              className={`text-left p-5 border bg-black/40 transition-all duration-200 ${CATEGORY_COLORS[f.category]} ${open ? "ring-1 ring-comma-green/60" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="mono text-[10px] uppercase tracking-[0.25em] text-comma-green">
                  {CATEGORY_LABEL[f.category]}
                </div>
                <div className="mono text-[10px] uppercase tracking-widest text-white/40">
                  {open ? "[ open ]" : "[ click to expand ]"}
                </div>
              </div>
              <h4 className="text-white font-semibold text-[16px] leading-snug mb-1">
                {f.title}
              </h4>
              <p className="text-white/55 text-[13px] leading-snug">{f.tagline}</p>

              {open && (
                <div className="mt-4 pt-4 border-t border-white/15 space-y-3">
                  <div>
                    <div className="mono text-[10px] uppercase tracking-widest text-white/40 mb-1">
                      what we tried
                    </div>
                    <p className="text-white/80 text-[13.5px] leading-relaxed">
                      {f.detail}
                    </p>
                  </div>
                  <div>
                    <div className="mono text-[10px] uppercase tracking-widest text-pink-400/80 mb-1">
                      why it didn't ship
                    </div>
                    <p className="text-white/80 text-[13.5px] leading-relaxed">
                      {f.lesson}
                    </p>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-white/50 text-[12.5px] mono text-center">
        {FAILURES.length} dead ends shown. The autoresearch loop ran ~195
        experiments total; only the algorithmic wins (≈ 8) survived.
      </p>
    </div>
  );
}
