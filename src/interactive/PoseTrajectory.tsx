// Visualizes the 6-dim pose vector PoseNet outputs across all 600 pairs,
// for both ground truth and our reconstruction, plus an integrated 2D
// trajectory of the car's path.
//
// The pose distortion is what the eval scores us on. This component lets
// you see WHERE in the video our pose diverges from the target, and HOW
// much per dimension.

import { useEffect, useRef, useState } from "react";

const URL = "/writeup_assets/pose_trajectory.json";

type PoseData = {
  n_pairs: number;
  fps: number;
  dim_names: string[];
  pose_gt: number[][];
  pose_ours: number[][];
  mse_per_pair: number[];
  approx_xy_gt: [number, number][];
  approx_xy_ours: [number, number][];
};

export default function PoseTrajectory() {
  const [data, setData] = useState<PoseData | null>(null);
  const [pair, setPair] = useState(300);
  const trajRef = useRef<HTMLCanvasElement | null>(null);
  const dimsRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetch(URL).then((r) => r.json()).then(setData).catch(console.error);
  }, []);

  // Draw 2D top-down trajectory
  useEffect(() => {
    if (!data) return;
    const cv = trajRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth;
    const cssH = cv.clientHeight;
    if (cv.width !== cssW * dpr) {
      cv.width = cssW * dpr;
      cv.height = cssH * dpr;
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    // Combine both paths to find bounding box (so they can overlay properly)
    const xs = [...data.approx_xy_gt.map((p) => p[0]), ...data.approx_xy_ours.map((p) => p[0])];
    const ys = [...data.approx_xy_gt.map((p) => p[1]), ...data.approx_xy_ours.map((p) => p[1])];
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 20;
    const range = Math.max(maxX - minX, maxY - minY, 1);
    const sx = (x: number) => pad + ((x - minX) / range) * (cssW - 2 * pad);
    const sy = (y: number) => cssH - (pad + ((y - minY) / range) * (cssH - 2 * pad));

    // Draw GT path (thicker, white)
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.approx_xy_gt.forEach(([x, y], i) => {
      const px = sx(x), py = sy(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Draw OURS path (green, thinner, on top)
    ctx.strokeStyle = "#51FF00";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    data.approx_xy_ours.forEach(([x, y], i) => {
      const px = sx(x), py = sy(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Mark current pair
    const [gx, gy] = data.approx_xy_gt[pair];
    const [ox, oy] = data.approx_xy_ours[pair];
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(sx(gx), sy(gy), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#51FF00";
    ctx.beginPath();
    ctx.arc(sx(ox), sy(oy), 3, 0, Math.PI * 2);
    ctx.fill();

    // Label start/end
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "10px ui-monospace, Consolas, monospace";
    const [gx0, gy0] = data.approx_xy_gt[0];
    const [gxL, gyL] = data.approx_xy_gt[data.approx_xy_gt.length - 1];
    ctx.fillText("start", sx(gx0) + 6, sy(gy0) - 6);
    ctx.fillText("end", sx(gxL) + 6, sy(gyL) - 6);
  }, [data, pair]);

  // Draw 6 mini per-dim line charts stacked
  useEffect(() => {
    if (!data) return;
    const cv = dimsRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth;
    const cssH = cv.clientHeight;
    if (cv.width !== cssW * dpr) {
      cv.width = cssW * dpr;
      cv.height = cssH * dpr;
    }
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    const N_DIMS = 6;
    const rowH = cssH / N_DIMS;
    const labelW = 70;
    const plotW = cssW - labelW;

    // Determine per-dim ranges from BOTH series
    const ranges: [number, number][] = [];
    for (let d = 0; d < N_DIMS; d++) {
      const all = [
        ...data.pose_gt.map((p) => p[d]),
        ...data.pose_ours.map((p) => p[d]),
      ];
      const lo = Math.min(...all);
      const hi = Math.max(...all);
      const pad = (hi - lo) * 0.1 || 0.001;
      ranges.push([lo - pad, hi + pad]);
    }

    for (let d = 0; d < N_DIMS; d++) {
      const y0 = d * rowH;
      const y1 = y0 + rowH;
      const [lo, hi] = ranges[d];
      const sx = (i: number) => labelW + (i / (data.n_pairs - 1)) * plotW;
      const sy = (v: number) => y1 - 4 - ((v - lo) / (hi - lo)) * (rowH - 8);

      // baseline line
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath(); ctx.moveTo(labelW, y1 - 1); ctx.lineTo(cssW, y1 - 1); ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "10px ui-monospace, Consolas, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`d${d}`, labelW - 4, y0 + 12);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px ui-monospace, Consolas, monospace";
      ctx.fillText(data.dim_names[d], labelW - 4, y0 + 24);

      // GT (white)
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      data.pose_gt.forEach((p, i) => {
        const x = sx(i), y = sy(p[d]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Ours (green)
      ctx.strokeStyle = "#51FF00";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      data.pose_ours.forEach((p, i) => {
        const x = sx(i), y = sy(p[d]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Playhead
      const px = sx(pair);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px, y1); ctx.stroke();
    }
    ctx.textAlign = "left";
  }, [data, pair]);

  if (!data) {
    return <div className="not-prose text-white/40 mono text-[12px] p-4">loading pose data…</div>;
  }

  const cur_gt = data.pose_gt[pair];
  const cur_ours = data.pose_ours[pair];

  // Click handler for trajectory canvas: pick nearest pair on path
  const onTrajClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Find nearest pair index by minimum screen distance to GT path
    const xs = [...data.approx_xy_gt.map((p) => p[0]), ...data.approx_xy_ours.map((p) => p[0])];
    const ys = [...data.approx_xy_gt.map((p) => p[1]), ...data.approx_xy_ours.map((p) => p[1])];
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 20;
    const range = Math.max(maxX - minX, maxY - minY, 1);
    const w = rect.width, h = rect.height;
    const sx = (x: number) => pad + ((x - minX) / range) * (w - 2 * pad);
    const sy = (y: number) => h - (pad + ((y - minY) / range) * (h - 2 * pad));
    let best = 0, bd = Infinity;
    data.approx_xy_gt.forEach(([x, y], i) => {
      const d = (sx(x) - cx) ** 2 + (sy(y) - cy) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    setPair(best);
  };

  return (
    <div className="not-prose space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.5fr] gap-3">
        {/* 2D top-down */}
        <div className="border border-white/15 bg-black/40 p-3">
          <div className="flex items-baseline justify-between mb-2">
            <div className="mono text-[10px] uppercase tracking-widest text-white/55">
              integrated 2D trajectory · click to seek
            </div>
            <div className="mono text-[10px] uppercase tracking-widest text-white/40">
              <span className="text-white/85">— gt</span>
              {"  "}
              <span className="text-comma-green">— ours</span>
            </div>
          </div>
          <canvas
            ref={trajRef}
            onClick={onTrajClick}
            className="w-full h-[320px] cursor-crosshair block"
          />
          <div className="mt-2 mono text-[10px] text-white/40 leading-relaxed">
            heading-integrated path from PoseNet's forward + yaw outputs (~30 fps, units arbitrary).
            Both trajectories overlay tightly because pose distortion is sub-percent of the
            magnitude of motion. Divergences cluster around turns.
          </div>
        </div>

        {/* Per-dim charts */}
        <div className="border border-white/15 bg-black/40 p-3">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">
            6-dim pose vector across all 600 pairs
          </div>
          <canvas ref={dimsRef} className="w-full h-[320px] block" />
        </div>
      </div>

      {/* Pair selector + per-dim values */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55">PAIR</div>
          <div className="text-comma-green text-[18px] font-bold mono leading-none">
            {pair.toString().padStart(3, " ")} <span className="text-white/35 text-[12px]">/ {data.n_pairs}</span>
          </div>
          <div className="ml-auto text-white/55 mono text-[11px]">
            this pair's MSE: <span className="text-white">{(data.mse_per_pair[pair]).toFixed(6)}</span>
          </div>
        </div>
        <input
          type="range"
          min={0} max={data.n_pairs - 1} step={1}
          value={pair}
          onChange={(e) => setPair(parseInt(e.target.value))}
          className="w-full accent-[#51FF00]"
        />
      </div>

      {/* Per-dim values table */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mono text-[11px]">
        {data.dim_names.map((name, d) => {
          const g = cur_gt[d];
          const o = cur_ours[d];
          const err = Math.abs(g - o);
          return (
            <div key={d} className="border border-white/10 p-2 bg-black/30">
              <div className="text-white/45 uppercase tracking-widest text-[9px]">d{d} · {name}</div>
              <div className="text-white/85 mt-1">gt {g.toFixed(4)}</div>
              <div className="text-comma-green">ours {o.toFixed(4)}</div>
              <div className="text-pink-400/80 mt-1">|Δ| {err.toFixed(4)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
