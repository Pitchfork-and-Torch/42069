import { useEffect, useRef } from "react";
import { playVictoryBlaze } from "@/lib/sound";
import { formatDuration } from "@/lib/format";
import { shareScorecardToX } from "@/lib/share";
import { saveLocalScore } from "@/lib/local-board";
import { submitScore } from "@/lib/leaderboard";

type Props = {
  open: boolean;
  taps: number;
  durationMs: number;
  name?: string;
  onDone: () => void;
  onPosted?: () => void;
};

function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

/** Full-screen Absolute Duality moment: Elon in the haze + stinger. */
export function Celebration({
  open,
  taps,
  durationMs,
  name,
  onDone,
  onPosted,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    playVictoryBlaze();

    const timer = window.setTimeout(() => onDone(), 7200);
    return () => window.clearTimeout(timer);
  }, [open, onDone]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    type P = {
      x: number;
      y: number;
      r: number;
      vx: number;
      vy: number;
      a: number;
      life: number;
      hue: number;
    };
    let parts: P[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (n: number) => {
      for (let i = 0; i < n; i++) {
        parts.push({
          x: w * 0.5 + (Math.random() - 0.5) * w * 0.35,
          y: h * 0.55 + Math.random() * h * 0.25,
          r: 40 + Math.random() * 90,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -0.4 - Math.random() * 0.9,
          a: 0.08 + Math.random() * 0.12,
          life: 1,
          hue: 95 + Math.random() * 35,
        });
      }
    };

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      if (parts.length < 40 && Math.random() > 0.4) spawn(2);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.004;
        p.r += 0.15;
        p.a *= 0.994;
        if (p.life <= 0 || p.a < 0.01) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `hsla(${p.hue}, 40%, 45%, ${p.a})`);
        g.addColorStop(1, `hsla(${p.hue}, 30%, 20%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      parts = parts.filter((p) => p.life > 0 && p.a >= 0.01);
      raf = requestAnimationFrame(tick);
    };

    resize();
    spawn(28);
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const postAndShare = async () => {
    const who = (name?.trim() || "Dualist").slice(0, 24);
    try {
      const res = await submitScore({
        data: {
          name: who,
          mode: "free_run",
          score: taps,
          durationMs,
        },
      });
      saveLocalScore({
        id: res.id,
        name: who,
        mode: "free_run",
        score: taps,
        durationMs,
      });
    } catch {
      saveLocalScore({
        name: who,
        mode: "free_run",
        score: taps,
        durationMs,
      });
    }
    onPosted?.();
    shareScorecardToX({
      mode: "free_run",
      score: taps,
      durationMs,
      name: who,
    });
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Absolute Duality achieved"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 bg-bg/85 backdrop-blur-md" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

      <div className="celebration-enter relative z-10 mx-4 flex max-w-lg flex-col items-center text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-nice">
          Absolute Duality
        </p>
        <div className="relative mt-5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[-18%] rounded-full bg-nice/10 blur-2xl"
          />
          <img
            src="/assets/elon-blaze.jpg"
            alt="A familiar face emerges from the haze"
            width={320}
            height={320}
            className="celebration-portrait relative size-[min(72vw,320px)] rounded-full border border-border-strong object-cover shadow-[var(--shadow-soft)]"
            draggable={false}
          />
        </div>
        <h2 className="font-display mt-6 text-3xl text-fg sm:text-4xl">
          42,069 taps.
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
          The registry has verified your dual achievement. A face appears in the
          haze. The counter returns to zero. Nice.
        </p>
        <dl className="mt-5 grid w-full grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface/80 px-3 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-subtle">
              Taps
            </dt>
            <dd className="font-mono text-lg tabular text-fg">
              {taps.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg border border-border bg-surface/80 px-3 py-2">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-subtle">
              Time
            </dt>
            <dd className="font-mono text-lg tabular text-fg">
              {formatDuration(durationMs)}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void postAndShare()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-fg px-5 text-sm font-medium text-bg transition-transform duration-150 active:scale-[0.96] hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40"
          >
            <XLogo className="size-3.5" />
            Post & Share on X
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform duration-150 active:scale-[0.96] hover:bg-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40"
          >
            Reset & continue
          </button>
        </div>
      </div>
    </div>
  );
}
