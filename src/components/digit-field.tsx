import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vy: number;
  vx: number;
  char: string;
  alpha: number;
  size: number;
};

const CHARS = ["4", "2", "0", "6", "9"];

export function DigitField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let particles: Particle[] = [];
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(48, Math.floor((w * h) / 28000));
      particles = Array.from({ length: count }, () => spawn(true));
    };

    const spawn = (anywhere = false): Particle => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -20,
      vy: 0.15 + Math.random() * 0.35,
      vx: (Math.random() - 0.5) * 0.15,
      char: CHARS[Math.floor(Math.random() * CHARS.length)]!,
      alpha: 0.04 + Math.random() * 0.08,
      size: 11 + Math.random() * 18,
    });

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = "500 14px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.y += p.vy;
        p.x += p.vx;
        if (p.y > h + 30 || p.x < -30 || p.x > w + 30) {
          particles[i] = spawn(false);
          continue;
        }
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#f4f4f5";
        ctx.font = `500 ${p.size}px 'IBM Plex Mono', monospace`;
        ctx.fillText(p.char, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
    />
  );
}
