// Interactive scrubber for the SegNet-overlay video. Pulls per-pair stats
// (agreement %, class distribution) from segnet_grid_stats.json and lets you:
//   - play / pause the rendered MP4
//   - scrub via a sparkline that visualizes per-pair agreement %
//   - see live class-distribution bars for both original and our reconstruction
//
// The hard claim is "they look totally different but produce identical SegNet
// output". This component lets you walk all 600 pairs and verify it.

import { useEffect, useRef, useState } from "react";

type PairStat = {
  pair: number;
  agree_pct: number;
  class_orig: number[]; // length 5
  class_ours: number[]; // length 5
};

type Stats = {
  n_pairs: number;
  fps: number;
  class_names: string[];
  class_colors: number[][];
  pairs: PairStat[];
};

const VIDEO_URL = "/writeup_assets/segnet_grid.mp4";
const STATS_URL = "/writeup_assets/segnet_grid_stats.json";

export default function SegNetScrubber() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sparkRef = useRef<HTMLCanvasElement | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pair, setPair] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Load stats once
  useEffect(() => {
    fetch(STATS_URL)
      .then((r) => r.json())
      .then((data: Stats) => setStats(data))
      .catch((e) => console.error("failed to load stats", e));
  }, []);

  // Update pair from video time
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stats) return;
    const onTime = () => {
      const p = Math.min(stats.n_pairs - 1, Math.floor(v.currentTime * stats.fps));
      setPair(p);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [stats]);

  // Draw sparkline of agreement % across all pairs
  useEffect(() => {
    if (!stats) return;
    const cv = sparkRef.current;
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

    // Find min/max of agreement % to scale to vertical extent
    const agrees = stats.pairs.map((p) => p.agree_pct);
    const lo = Math.min(...agrees);
    const yLo = Math.max(98, Math.floor(lo * 10) / 10); // visual zoom on top 2%
    const yHi = 100;

    // Background grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let v = yLo; v <= yHi; v += 0.5) {
      const y = cssH - ((v - yLo) / (yHi - yLo)) * cssH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    // Sparkline: green path
    ctx.strokeStyle = "#51FF00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    stats.pairs.forEach((p, i) => {
      const x = (i / (stats.n_pairs - 1)) * cssW;
      const yClamp = Math.max(yLo, Math.min(yHi, p.agree_pct));
      const y = cssH - ((yClamp - yLo) / (yHi - yLo)) * cssH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill below path
    ctx.lineTo(cssW, cssH);
    ctx.lineTo(0, cssH);
    ctx.closePath();
    ctx.fillStyle = "rgba(81, 255, 0, 0.12)";
    ctx.fill();

    // Marker: vertical line at current pair
    const px = (pair / (stats.n_pairs - 1)) * cssW;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cssH);
    ctx.stroke();
    // Dot
    const cur = stats.pairs[pair];
    const yDotClamp = Math.max(yLo, Math.min(yHi, cur.agree_pct));
    const py = cssH - ((yDotClamp - yLo) / (yHi - yLo)) * cssH;
    ctx.fillStyle = "#51FF00";
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px ui-monospace, Consolas, monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${yHi.toFixed(1)}%`, cssW - 4, 12);
    ctx.fillText(`${yLo.toFixed(1)}%`, cssW - 4, cssH - 4);
  }, [stats, pair]);

  // Click sparkline → seek
  const onSparkClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!stats || !videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const targetPair = Math.max(0, Math.min(stats.n_pairs - 1, Math.round(fx * (stats.n_pairs - 1))));
    videoRef.current.currentTime = targetPair / stats.fps;
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const stepPair = (delta: number) => {
    if (!stats || !videoRef.current) return;
    const targetPair = Math.max(0, Math.min(stats.n_pairs - 1, pair + delta));
    videoRef.current.currentTime = targetPair / stats.fps;
  };

  const cur = stats?.pairs[pair];
  const agree = cur?.agree_pct ?? 0;

  return (
    <div className="not-prose space-y-4">
      {/* Video panel */}
      <div className="border border-white/15 bg-black overflow-hidden">
        <video
          ref={videoRef}
          src={VIDEO_URL}
          className="w-full block"
          muted
          playsInline
          preload="metadata"
        />
      </div>

      {/* Controls + live stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto,auto,1fr] gap-3 items-stretch">
        <div className="flex gap-2">
          <button
            onClick={togglePlay}
            className="px-4 py-2 border border-white/20 hover:border-comma-green hover:text-comma-green transition-colors mono text-[12px] uppercase tracking-widest"
          >
            {playing ? "[ pause ]" : "[ play ]"}
          </button>
          <button onClick={() => stepPair(-1)}
            className="px-3 py-2 border border-white/20 hover:border-comma-green hover:text-comma-green transition-colors mono text-[12px]"
          >−1</button>
          <button onClick={() => stepPair(1)}
            className="px-3 py-2 border border-white/20 hover:border-comma-green hover:text-comma-green transition-colors mono text-[12px]"
          >+1</button>
        </div>

        <div className="flex flex-col justify-center min-w-[140px]">
          <div className="mono text-[10px] uppercase tracking-widest text-white/45">PAIR</div>
          <div className="text-comma-green text-[20px] font-bold mono leading-none">
            {pair.toString().padStart(3, " ")} <span className="text-white/35 text-[14px]">/ {stats?.n_pairs ?? 600}</span>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="mono text-[10px] uppercase tracking-widest text-white/45">PIXEL-CLASS AGREEMENT</div>
          <div className="text-white text-[20px] font-bold mono leading-none">
            <span className={agree >= 99.95 ? "text-comma-green" : agree >= 99.5 ? "text-yellow-400" : "text-pink-400"}>
              {agree.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="border border-white/15 bg-black/40 p-2">
        <div className="flex items-baseline justify-between mb-1">
          <div className="mono text-[10px] uppercase tracking-widest text-white/55">
            AGREEMENT % ACROSS ALL 600 PAIRS — click to jump
          </div>
        </div>
        <canvas
          ref={sparkRef}
          onClick={onSparkClick}
          className="w-full h-[100px] cursor-crosshair block"
        />
      </div>

      {/* Class distribution bars */}
      {cur && stats && (
        <div className="grid grid-cols-2 gap-3">
          <ClassDistPanel
            label="SegNet on original"
            counts={cur.class_orig}
            colors={stats.class_colors}
            names={stats.class_names}
          />
          <ClassDistPanel
            label="SegNet on ours"
            counts={cur.class_ours}
            colors={stats.class_colors}
            names={stats.class_names}
          />
        </div>
      )}
    </div>
  );
}

function ClassDistPanel({
  label, counts, colors, names,
}: {
  label: string;
  counts: number[];
  colors: number[][];
  names: string[];
}) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="border border-white/10 p-3 bg-black/30">
      <div className="mono text-[10px] uppercase tracking-widest text-white/55 mb-2">{label}</div>
      <div className="flex h-5 w-full overflow-hidden">
        {counts.map((c, i) => {
          const pct = (c / total) * 100;
          if (pct < 0.001) return null;
          const [r, g, b] = colors[i];
          return (
            <div
              key={i}
              style={{
                width: `${pct}%`,
                backgroundColor: `rgb(${r},${g},${b})`,
              }}
              title={`${names[i]}: ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 mono text-[9px] text-white/65">
        {counts.map((c, i) => {
          const pct = (c / total) * 100;
          const [r, g, b] = colors[i];
          return (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-2 h-2"
                style={{ backgroundColor: `rgb(${r},${g},${b})` }}
              />
              <span>{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
