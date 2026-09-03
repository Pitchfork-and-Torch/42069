/** Web Audio celebration stingers  -  no external assets. */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  gain = 0.12,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Short click tick for taps */
export function playTapTick(intensity = 1) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime;
  const f = 420 + intensity * 40;
  tone(ctx, f, t, 0.04, "triangle", 0.04 * Math.min(1.5, intensity));
  tone(ctx, f * 1.5, t, 0.03, "sine", 0.02);
}

/** Milestone chime */
export function playMilestone() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    tone(ctx, f, t + i * 0.08, 0.2, "sine", 0.08);
  });
}

/**
 * Absolute Duality stinger  -  silly triumphant fanfare + wobble.
 * Intentionally meme-ish without external samples.
 */
export function playVictoryBlaze() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime;

  // Rising whoosh (noise-ish via detuned saws)
  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(80 + i * 18, t);
    osc.frequency.exponentialRampToValueAtTime(420 + i * 40, t + 0.9);
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.15);
  }

  // Fanfare arpeggio on 4-2-0 / 6-9 vibes (freq numbers chosen for fun)
  const notes = [
    220, 277.18, 329.63, 440, 523.25, 659.25, 880, 1046.5,
  ];
  notes.forEach((f, i) => {
    tone(ctx, f, t + 0.35 + i * 0.09, 0.28, "square", 0.06);
    tone(ctx, f * 2, t + 0.35 + i * 0.09, 0.22, "sine", 0.04);
  });

  // Final "nice" low thump
  tone(ctx, 69, t + 1.4, 0.45, "sine", 0.14);
  tone(ctx, 138, t + 1.45, 0.4, "triangle", 0.08);
  tone(ctx, 420, t + 1.55, 0.5, "sine", 0.07);

  // Little high sparkle cascade
  for (let i = 0; i < 12; i++) {
    tone(
      ctx,
      1200 + Math.random() * 800,
      t + 1.6 + i * 0.05,
      0.12,
      "sine",
      0.03,
    );
  }
}

export function playTrialStart() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime;
  tone(ctx, 330, t, 0.1, "sine", 0.07);
  tone(ctx, 440, t + 0.12, 0.1, "sine", 0.07);
  tone(ctx, 550, t + 0.24, 0.16, "sine", 0.08);
}

export function playTrialEnd() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime;
  tone(ctx, 523.25, t, 0.15, "triangle", 0.08);
  tone(ctx, 392, t + 0.14, 0.2, "triangle", 0.08);
  tone(ctx, 261.63, t + 0.3, 0.35, "sine", 0.1);
}
