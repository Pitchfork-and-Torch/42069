import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Award,
  ChevronRight,
  Copy,
  Flame,
  Hash,
  Sparkles,
  Check,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Timer,
  Play,
  Square,
  Zap,
} from "lucide-react";
import {
  FACTS,
  MILESTONES,
  SACRED,
  TICKER_ITEMS,
  auditNumber,
  randomOracle,
} from "@/lib/registry-data";
import {
  TRIAL_CONFIG,
  TRIAL_MODES,
  type BoardMode,
  type TrialMode,
} from "@/lib/leaderboard";
import { formatClock, formatDuration, formatInt } from "@/lib/format";
import {
  playMilestone,
  playTapTick,
  playTrialEnd,
  playTrialStart,
  unlockAudio,
} from "@/lib/sound";
import { cn } from "@/lib/utils";
import { DigitField } from "@/components/digit-field";
import {
  FloatingLabels,
  useClientMounted,
  useFloaters,
} from "@/components/floating-label";
import { Celebration } from "@/components/celebration";
import { LeaderboardPanel } from "@/components/leaderboard-panel";
import { ScoreSubmit } from "@/components/score-submit";

const STORAGE_KEY = "registry-42069-v2";
const X_FOLLOW_URL = "https://x.com/suddenlyjon";

type PlayMode = "free" | "trial";

type Persist = {
  taps: number;
  totalClicks: number;
  unlocked: number[];
  bestStreak: number;
  name: string;
  freeRunStartedAt: number | null;
  completions: number;
  bestFreeMs: number | null;
  bestTrial: Partial<Record<TrialMode, number>>;
};

const DEFAULT: Persist = {
  taps: 0,
  totalClicks: 0,
  unlocked: [],
  bestStreak: 0,
  name: "",
  freeRunStartedAt: null,
  completions: 0,
  bestFreeMs: null,
  bestTrial: {},
};

function loadPersist(): Persist {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const v1 = localStorage.getItem("registry-42069-v1");
      if (v1) {
        const old = JSON.parse(v1) as { points?: number; name?: string };
        return {
          ...DEFAULT,
          taps: Math.min(SACRED - 1, Math.floor(Number(old.points) || 0)),
          name: typeof old.name === "string" ? old.name.slice(0, 24) : "",
        };
      }
      return { ...DEFAULT };
    }
    const parsed = JSON.parse(raw) as Partial<Persist>;
    return {
      taps: Math.min(SACRED * 2, Math.floor(Number(parsed.taps) || 0)),
      totalClicks: Number(parsed.totalClicks) || 0,
      unlocked: Array.isArray(parsed.unlocked)
        ? parsed.unlocked.map(Number).filter(Number.isFinite)
        : [],
      bestStreak: Number(parsed.bestStreak) || 0,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 24) : "",
      freeRunStartedAt:
        typeof parsed.freeRunStartedAt === "number"
          ? parsed.freeRunStartedAt
          : null,
      completions: Number(parsed.completions) || 0,
      bestFreeMs:
        typeof parsed.bestFreeMs === "number" ? parsed.bestFreeMs : null,
      bestTrial:
        parsed.bestTrial && typeof parsed.bestTrial === "object"
          ? parsed.bestTrial
          : {},
    };
  } catch {
    return { ...DEFAULT };
  }
}

function floaterText(gain: number) {
  if (gain >= 69) return `+${gain} NICE`;
  if (gain >= 20) return "blaze";
  if (gain >= 7) return "nice.";
  return `+${gain}`;
}

type TrialState =
  | { status: "idle" }
  | { status: "running"; mode: TrialMode; endsAt: number; taps: number }
  | {
      status: "finished";
      mode: TrialMode;
      taps: number;
      durationMs: number;
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

export function RegistryApp() {
  const mounted = useClientMounted();
  const { floaters, spawn } = useFloaters();
  const [state, setState] = useState<Persist>(DEFAULT);
  const [playMode, setPlayMode] = useState<PlayMode>("free");
  const [trialPick, setTrialPick] = useState<TrialMode>("trial_42");
  const [trial, setTrial] = useState<TrialState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [pop, setPop] = useState(0);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [oracle, setOracle] = useState(
    "Press consult to receive a dual proclamation.",
  );
  const [auditInput, setAuditInput] = useState("42069");
  const [auditResult, setAuditResult] = useState(() => auditNumber(SACRED));
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [lastWin, setLastWin] = useState<{
    taps: number;
    durationMs: number;
  } | null>(null);
  const [showFreeSubmit, setShowFreeSubmit] = useState(false);
  const [boardRefresh, setBoardRefresh] = useState(0);
  const [pendingBoardMode, setPendingBoardMode] = useState<
    BoardMode | undefined
  >();

  const streakTimer = useRef<number | null>(null);
  const heroRef = useRef<HTMLButtonElement>(null);
  const streakRef = useRef(0);
  const tapsRef = useRef(0);
  const freeStartRef = useRef<number | null>(null);
  const celebratingRef = useRef(false);
  const trialRef = useRef(trial);
  trialRef.current = trial;

  useEffect(() => {
    const loaded = loadPersist();
    setState(loaded);
    tapsRef.current = loaded.taps;
    freeStartRef.current = loaded.freeRunStartedAt;
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, mounted]);

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    tapsRef.current = state.taps;
  }, [state.taps]);

  useEffect(() => {
    freeStartRef.current = state.freeRunStartedAt;
  }, [state.freeRunStartedAt]);

  useEffect(() => {
    if (trial.status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, [trial.status]);

  useEffect(() => {
    if (trial.status !== "running") return;
    if (now < trial.endsAt) return;
    playTrialEnd();
    const cfg = TRIAL_CONFIG[trial.mode];
    setTrial({
      status: "finished",
      mode: trial.mode,
      taps: trial.taps,
      durationMs: cfg.seconds * 1000,
    });
    setState((s) => ({
      ...s,
      bestTrial: {
        ...s.bestTrial,
        [trial.mode]: Math.max(s.bestTrial[trial.mode] ?? 0, trial.taps),
      },
    }));
    setPendingBoardMode(trial.mode);
  }, [now, trial]);

  const progress = Math.min(1, state.taps / SACRED);
  const nextMilestone = MILESTONES.find((m) => state.taps < m.at);

  const trialSecondsLeft =
    trial.status === "running"
      ? Math.max(0, (trial.endsAt - now) / 1000)
      : trial.status === "idle"
        ? TRIAL_CONFIG[trialPick].seconds
        : 0;

  const announce = useCallback((title: string, body: string) => {
    setToast({ title, body });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const rememberName = useCallback((name: string) => {
    setState((s) => ({ ...s, name: name.trim().slice(0, 24) }));
  }, []);

  const triggerWin = useCallback((finalTaps: number, durationMs: number) => {
    if (celebratingRef.current) return;
    celebratingRef.current = true;
    setLastWin({ taps: finalTaps, durationMs });
    setCelebrate(true);
    setShowFreeSubmit(true);
    setPendingBoardMode("free_run");
    setState((prev) => ({
      ...prev,
      taps: SACRED,
      freeRunStartedAt: null,
      completions: prev.completions + 1,
      bestFreeMs:
        prev.bestFreeMs === null
          ? durationMs
          : Math.min(prev.bestFreeMs, durationMs),
      unlocked: MILESTONES.map((m) => m.at),
    }));
    freeStartRef.current = null;
    tapsRef.current = SACRED;
  }, []);

  const addTaps = useCallback(
    (gain: number, clientX?: number, clientY?: number) => {
      unlockAudio();
      const g = Math.max(1, Math.floor(gain));
      playTapTick(1 + Math.min(3, g / 20));

      const t = trialRef.current;
      if (playMode === "trial" && t.status === "running") {
        const next = t.taps + g;
        setTrial({ ...t, taps: next });
        setPop((p) => p + 1);
        const x =
          clientX ??
          (heroRef.current
            ? heroRef.current.getBoundingClientRect().left +
              heroRef.current.offsetWidth / 2
            : window.innerWidth / 2);
        const y =
          clientY ??
          (heroRef.current
            ? heroRef.current.getBoundingClientRect().top + 40
            : window.innerHeight / 3);
        spawn(floaterText(g), x - 20, y - 10);
        setStreak((s) => {
          const ns = s + 1;
          if (streakTimer.current) window.clearTimeout(streakTimer.current);
          streakTimer.current = window.setTimeout(() => setStreak(0), 1200);
          return ns;
        });
        return;
      }

      if (playMode === "trial") return;
      if (celebratingRef.current) return;

      const startedAt = freeStartRef.current ?? Date.now();
      if (freeStartRef.current === null) {
        freeStartRef.current = startedAt;
      }

      setState((prev) => {
        const before = prev.taps;
        const nextTaps = before + g;
        const newly = MILESTONES.filter(
          (m) => nextTaps >= m.at && !prev.unlocked.includes(m.at),
        );
        const unlocked = [
          ...prev.unlocked,
          ...newly.map((m) => m.at),
        ].sort((a, b) => a - b);

        if (newly.length) {
          playMilestone();
          const last = newly[newly.length - 1]!;
          queueMicrotask(() => announce(last.title, last.body));
        }

        const hit = nextTaps >= SACRED && before < SACRED;
        if (hit) {
          const durationMs = Date.now() - startedAt;
          queueMicrotask(() =>
            triggerWin(Math.min(nextTaps, SACRED + g), durationMs),
          );
          return {
            ...prev,
            taps: SACRED,
            totalClicks: prev.totalClicks + 1,
            unlocked: MILESTONES.map((m) => m.at),
            freeRunStartedAt: startedAt,
            bestStreak: Math.max(prev.bestStreak, streakRef.current + 1),
          };
        }

        return {
          ...prev,
          taps: nextTaps,
          totalClicks: prev.totalClicks + 1,
          unlocked,
          freeRunStartedAt: prev.freeRunStartedAt ?? startedAt,
          bestStreak: Math.max(prev.bestStreak, streakRef.current + 1),
        };
      });

      setStreak((s) => {
        const ns = s + 1;
        if (streakTimer.current) window.clearTimeout(streakTimer.current);
        streakTimer.current = window.setTimeout(() => setStreak(0), 1400);
        return ns;
      });

      setPop((p) => p + 1);

      const x =
        clientX ??
        (heroRef.current
          ? heroRef.current.getBoundingClientRect().left +
            heroRef.current.offsetWidth / 2
          : window.innerWidth / 2);
      const y =
        clientY ??
        (heroRef.current
          ? heroRef.current.getBoundingClientRect().top + 40
          : window.innerHeight / 3);

      spawn(floaterText(g), x - 20, y - 10);
    },
    [announce, playMode, spawn, triggerWin],
  );

  const onHeroClick = (e: MouseEvent) => {
    const mult = 1 + Math.min(6, Math.floor(streakRef.current / 6));
    const s = streakRef.current;
    const base = s >= 12 ? 5 : s >= 6 ? 2 : 1;
    addTaps(base * mult, e.clientX, e.clientY);
  };

  const startTrial = () => {
    unlockAudio();
    playTrialStart();
    const cfg = TRIAL_CONFIG[trialPick];
    setTrial({
      status: "running",
      mode: trialPick,
      endsAt: Date.now() + cfg.seconds * 1000,
      taps: 0,
    });
    setStreak(0);
    setNow(Date.now());
  };

  const abortTrial = () => {
    setTrial({ status: "idle" });
    setStreak(0);
  };

  const onCelebrateDone = useCallback(() => {
    setCelebrate(false);
    celebratingRef.current = false;
    setState((prev) => ({
      ...prev,
      taps: 0,
      unlocked: [],
      freeRunStartedAt: null,
    }));
    tapsRef.current = 0;
    freeStartRef.current = null;
    setStreak(0);
  }, []);

  const displayTaps =
    playMode === "trial" && trial.status === "running"
      ? trial.taps
      : playMode === "trial" && trial.status === "finished"
        ? trial.taps
        : state.taps;

  const certText = useMemo(() => {
    const who = state.name.trim() || "Anonymous Dualist";
    return [
      "OFFICIAL CERTIFICATE OF DUALITY",
      "Registry of the Number 42069",
      "",
      `This certifies that ${who}`,
      `has registered ${formatInt(state.taps)} taps toward Absolute Duality`,
      `across ${formatInt(state.totalClicks)} formal acknowledgements.`,
      "",
      `Completions: ${state.completions}`,
      `Milestones unlocked: ${state.unlocked.length}/${MILESTONES.length}`,
      `Peak streak: ${state.bestStreak}`,
      state.bestFreeMs !== null
        ? `Best free run: ${formatDuration(state.bestFreeMs)}`
        : "Best free run:  - ",
      "",
      `Issued by 42069.grok.me  -  document is extremely rectangular.`,
    ].join("\n");
  }, [state]);

  const copyCert = async () => {
    try {
      await navigator.clipboard.writeText(certText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      announce("Copy blocked", "Select the certificate text manually.");
    }
  };

  const resetFree = () => {
    setState((s) => ({
      ...s,
      taps: 0,
      unlocked: [],
      freeRunStartedAt: null,
    }));
    tapsRef.current = 0;
    freeStartRef.current = null;
    setStreak(0);
    setShowFreeSubmit(false);
    celebratingRef.current = false;
    setCelebrate(false);
    announce("Ledger reset", "Free-run taps cleared. The number waits.");
  };

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <DigitField />
      <FloatingLabels floaters={floaters} />
      <Celebration
        open={celebrate}
        taps={lastWin?.taps ?? SACRED}
        durationMs={lastWin?.durationMs ?? 0}
        name={state.name}
        onDone={onCelebrateDone}
        onPosted={() => {
          setPendingBoardMode("free_run");
          setBoardRefresh((n) => n + 1);
        }}
      />


      <div className="relative z-10 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="overflow-hidden py-2">
          <div className="animate-ticker flex w-max gap-10 whitespace-nowrap font-mono text-xs tracking-wide text-muted">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span
                key={`${item}-${i}`}
                className="inline-flex items-center gap-2"
              >
                <span className="size-1 rounded-full bg-nice" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top-left follow strip */}
      <div className="relative z-20 mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <a
          href={X_FOLLOW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group follow-x inline-flex h-10 items-center gap-2.5 rounded-full border border-border-strong bg-surface pl-1.5 pr-3.5",
            "text-sm font-medium tracking-tight text-fg shadow-[var(--shadow-soft)]",
            "transition-[transform,background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)]",
            "hover:border-fg/30 hover:bg-surface-2 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-fg)_12%,transparent),0_12px_32px_color-mix(in_oklab,#000_35%,transparent)]",
            "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-fg text-bg transition-transform duration-200 ease-[var(--ease-out)] group-hover:scale-105">
            <XLogo className="size-3.5" />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-subtle transition-colors group-hover:text-muted">
              Follow on X
            </span>
            <span className="mt-0.5 text-[13px] font-medium tracking-tight">
              @suddenlyjon
            </span>
          </span>
        </a>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <ShieldCheck className="size-3.5 text-nice" strokeWidth={1.75} />
          <span className="hidden sm:inline">Documented · Dual · Binding</span>
          <span className="sm:hidden">Documented</span>
        </div>
      </div>

      <header className="relative z-10 mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface font-mono text-xs font-medium tracking-tight text-fg">
          42
        </div>
        <div>
          <p className="text-sm font-medium tracking-tight text-fg">
            Official Registry
          </p>
          <p className="font-mono text-[11px] tracking-wide text-subtle">
            42069.grok.me
          </p>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <ModeChip
            active={playMode === "free"}
            onClick={() => {
              if (trial.status === "running") return;
              setPlayMode("free");
            }}
            icon={<Zap className="size-3.5" />}
          >
            Free Run
          </ModeChip>
          <ModeChip
            active={playMode === "trial"}
            onClick={() => setPlayMode("trial")}
            icon={<Timer className="size-3.5" />}
          >
            Timed Trial
          </ModeChip>
        </div>

        <section className="animate-fade-rise pt-6 text-center sm:pt-8">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-subtle">
            {playMode === "trial"
              ? trial.status === "running"
                ? TRIAL_CONFIG[trial.mode].label
                : trial.status === "finished"
                  ? "Trial complete"
                  : "Select a trial window"
              : "Tap to Absolute Duality"}
          </p>

          {playMode === "trial" && trial.status === "running" && (
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 font-mono text-sm tabular text-fg">
              <Timer className="size-4 text-nice" />
              <span className={cn(trialSecondsLeft <= 5 && "text-warn")}>
                {formatClock(trialSecondsLeft)}
              </span>
              <span className="text-subtle">·</span>
              <span>{formatInt(trial.taps)} taps</span>
            </div>
          )}

          <div className="relative mx-auto inline-block">
            <div
              aria-hidden
              className="animate-pulse-ring pointer-events-none absolute inset-[-12%] rounded-full border border-nice/30"
            />
            <button
              ref={heroRef}
              type="button"
              onClick={onHeroClick}
              disabled={playMode === "trial" && trial.status !== "running"}
              className={cn(
                "font-display select-none text-[clamp(3.5rem,16vw,8rem)] leading-none tracking-[-0.03em] text-fg transition-transform duration-150",
                "hover:text-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                "disabled:cursor-not-allowed disabled:opacity-40",
                pop > 0 && "animate-number-pop",
              )}
              key={pop}
              aria-label="Register taps"
            >
              {formatInt(displayTaps)}
            </button>
          </div>

          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            {playMode === "free" ? (
              <>
                Half blaze. Half nice. Fully documented.
                <span className="mt-1 block text-sm text-subtle">
                  Reach {formatInt(SACRED)} taps. A familiar face appears in the
                  haze. Then it resets.
                </span>
              </>
            ) : (
              <span className="block text-sm text-subtle">
                Smash the number during the window. Post your score. Become
                legend.
              </span>
            )}
          </p>

          {playMode === "free" && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <ActionButton
                onClick={() => addTaps(7)}
                icon={<Hash className="size-4" />}
              >
                Nice (+7)
              </ActionButton>
              <ActionButton
                onClick={() => addTaps(20)}
                variant="primary"
                icon={<Flame className="size-4" />}
              >
                Blaze (+20)
              </ActionButton>
              <ActionButton
                onClick={() => addTaps(69)}
                icon={<Sparkles className="size-4" />}
              >
                Dual burst
              </ActionButton>
            </div>
          )}

          {playMode === "trial" && trial.status === "idle" && (
            <div className="mx-auto mt-7 max-w-lg">
              <div className="grid gap-2 sm:grid-cols-3">
                {TRIAL_MODES.map((m) => {
                  const cfg = TRIAL_CONFIG[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTrialPick(m)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        trialPick === m
                          ? "border-nice/50 bg-nice-dim"
                          : "border-border bg-surface hover:border-border-strong",
                      )}
                    >
                      <p className="font-mono text-[11px] text-subtle">
                        {cfg.seconds}s
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-fg">
                        {cfg.label}
                      </p>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">
                {TRIAL_CONFIG[trialPick].blurb}
              </p>
              <div className="mt-4 flex justify-center">
                <ActionButton
                  onClick={startTrial}
                  variant="primary"
                  icon={<Play className="size-4" />}
                >
                  Start trial
                </ActionButton>
              </div>
            </div>
          )}

          {playMode === "trial" && trial.status === "running" && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <ActionButton
                onClick={() => addTaps(1)}
                icon={<Hash className="size-4" />}
              >
                +1
              </ActionButton>
              <ActionButton
                onClick={() => addTaps(5)}
                variant="primary"
                icon={<Flame className="size-4" />}
              >
                +5 burst
              </ActionButton>
              <ActionButton
                onClick={abortTrial}
                icon={<Square className="size-4" />}
              >
                Abort
              </ActionButton>
            </div>
          )}

          {playMode === "trial" && trial.status === "finished" && (
            <div className="mx-auto mt-7 max-w-md space-y-4 text-left">
              <div className="rounded-xl border border-border bg-surface p-4 text-center">
                <p className="font-mono text-[11px] uppercase tracking-wider text-subtle">
                  Final score
                </p>
                <p className="font-display mt-1 text-4xl text-fg">
                  {formatInt(trial.taps)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {TRIAL_CONFIG[trial.mode].label} ·{" "}
                  {TRIAL_CONFIG[trial.mode].seconds}s window
                </p>
              </div>
              <ScoreSubmit
                mode={trial.mode}
                score={trial.taps}
                durationMs={trial.durationMs}
                defaultName={state.name}
                onName={rememberName}
                onSubmitted={({ mode: m }) => {
                  setPendingBoardMode(m);
                  setBoardRefresh((n) => n + 1);
                }}

                onSkip={() => setTrial({ status: "idle" })}
              />
              <div className="flex justify-center">
                <ActionButton
                  onClick={() => setTrial({ status: "idle" })}
                  icon={<RotateCcw className="size-4" />}
                >
                  Run again
                </ActionButton>
              </div>
            </div>
          )}
        </section>

        {playMode === "free" && (
          <>
            <section className="mt-10 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Taps"
                value={mounted ? formatInt(state.taps) : " - "}
                hint={
                  nextMilestone
                    ? `${formatInt(nextMilestone.at - state.taps)} to "${nextMilestone.title}"`
                    : "Absolute Duality achieved"
                }
              />
              <StatCard
                label="Streak"
                value={mounted ? String(Math.max(streak, 0)) : " - "}
                hint={
                  state.bestStreak
                    ? `Best ${state.bestStreak}`
                    : "Rhythm multiplies taps"
                }
              />
              <StatCard
                label="Completions"
                value={mounted ? formatInt(state.completions) : " - "}
                hint={
                  state.bestFreeMs
                    ? `Best ${formatDuration(state.bestFreeMs)}`
                    : `Goal ${formatInt(SACRED)}`
                }
              />
            </section>

            <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface p-1">
              <div className="h-2 overflow-hidden rounded-lg bg-surface-2">
                <div
                  className="h-full rounded-lg bg-nice transition-[width] duration-300 ease-out"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
            <p className="mt-2 text-center font-mono text-[11px] tabular text-subtle">
              {Math.floor(progress * 100)}% · {formatInt(state.taps)} /{" "}
              {formatInt(SACRED)}
            </p>
          </>
        )}

        {playMode === "free" && showFreeSubmit && lastWin && !celebrate && (
          <div className="mx-auto mt-8 max-w-md">
            <ScoreSubmit
              mode="free_run"
              score={lastWin.taps}
              durationMs={lastWin.durationMs}
              defaultName={state.name}
              onName={rememberName}
              onSubmitted={({ mode: m }) => {
                setPendingBoardMode(m);
                setBoardRefresh((n) => n + 1);
                setShowFreeSubmit(false);
              }}

              onSkip={() => setShowFreeSubmit(false)}
            />
          </div>
        )}

        <div className="mt-10">
          <LeaderboardPanel
            highlightMode={pendingBoardMode}
            refreshKey={boardRefresh}
          />
        </div>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel
            title="Oracle of Duality"
            icon={<ScrollText className="size-4" />}
            subtitle="Authoritative nonsense, issued promptly"
          >
            <blockquote className="font-display text-xl leading-snug text-fg italic sm:text-2xl">
              "{oracle}"
            </blockquote>
            <div className="mt-6 flex flex-wrap gap-2">
              <ActionButton
                onClick={() => {
                  setOracle(randomOracle(Date.now() + state.totalClicks));
                  if (playMode === "free") addTaps(1);
                }}
                variant="primary"
                icon={<ChevronRight className="size-4" />}
              >
                Consult
              </ActionButton>
            </div>
          </Panel>

          <Panel
            title="Number Auditor"
            icon={<ShieldCheck className="size-4" />}
            subtitle="How nice is any integer, really?"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex-1">
                <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-subtle">
                  Subject number
                </span>
                <input
                  value={auditInput}
                  onChange={(e) => setAuditInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setAuditResult(auditNumber(Number(auditInput.trim())));
                    }
                  }}
                  inputMode="numeric"
                  className="h-11 w-full rounded-md border border-border-strong bg-bg px-3 font-mono text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-nice/60 focus:ring-2 focus:ring-nice/20"
                  placeholder="e.g. 69, 420, 80085"
                />
              </label>
              <div className="flex items-end">
                <ActionButton
                  onClick={() =>
                    setAuditResult(auditNumber(Number(auditInput.trim())))
                  }
                  variant="primary"
                >
                  Audit
                </ActionButton>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-border bg-bg/60 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-wider text-subtle">
                  Grade
                </p>
                <p className="font-mono text-lg font-medium tabular text-nice">
                  {auditResult.score}
                  <span className="text-subtle">/100</span>
                </p>
              </div>
              <p className="mt-1 font-display text-2xl text-fg">
                {auditResult.grade}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {auditResult.summary}
              </p>
              <ul className="mt-3 space-y-1.5">
                {auditResult.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex gap-2 text-sm text-muted before:mt-2 before:size-1 before:shrink-0 before:rounded-full before:bg-nice/70 before:content-['']"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-5">
          <Panel
            className="lg:col-span-3"
            title="Milestone ledger"
            icon={<Award className="size-4" />}
            subtitle="Free-run achievements en route to 42,069"
          >
            <ol className="space-y-0 divide-y divide-border">
              {MILESTONES.map((m) => {
                const done = mounted && state.unlocked.includes(m.at);
                return (
                  <li
                    key={m.at}
                    className={cn(
                      "flex items-start gap-3 py-3 first:pt-0 last:pb-0",
                      !done && "opacity-55",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                        done
                          ? "border-nice/40 bg-nice-dim text-nice"
                          : "border-border text-subtle",
                      )}
                    >
                      {done ? (
                        <Check className="size-3" strokeWidth={2.5} />
                      ) : (
                        "·"
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium text-fg">{m.title}</p>
                        <p className="font-mono text-[11px] tabular text-subtle">
                          {formatInt(m.at)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{m.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>

          <Panel
            className="lg:col-span-2"
            title="Certificate"
            icon={<Award className="size-4" />}
            subtitle="Extremely rectangular documentation"
          >
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-subtle">
                Display name
              </span>
              <input
                value={state.name}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    name: e.target.value.slice(0, 24),
                  }))
                }
                className="h-11 w-full rounded-md border border-border-strong bg-bg px-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-nice/60 focus:ring-2 focus:ring-nice/20"
                placeholder="A. Dualist"
                maxLength={24}
              />
            </label>

            <pre className="mt-4 max-h-56 overflow-auto rounded-lg border border-border bg-bg p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
              {certText}
            </pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                onClick={copyCert}
                variant="primary"
                icon={
                  copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )
                }
              >
                {copied ? "Copied" : "Copy certificate"}
              </ActionButton>
              <ActionButton
                onClick={resetFree}
                icon={<RotateCcw className="size-4" />}
              >
                Reset taps
              </ActionButton>
            </div>
          </Panel>
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl text-fg sm:text-3xl">
              Technical brief
            </h2>
            <p className="mt-1 text-sm text-muted">
              Facts the registry is willing to stand behind.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FACTS.map((f) => (
              <article
                key={f.label}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <p className="font-mono text-[11px] uppercase tracking-wider text-subtle">
                  {f.label}
                </p>
                <p className="mt-2 font-mono text-lg font-medium tracking-tight text-fg">
                  {f.value}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-xl border border-border bg-surface px-5 py-8 sm:px-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">
            Charter
          </p>
          <h2 className="mt-2 font-display text-3xl leading-tight text-fg sm:text-4xl">
            Why 42069 exists
          </h2>
          <div className="mt-5 max-w-2xl space-y-4 text-base leading-relaxed text-muted">
            <p>
              Some numbers count. Some numbers measure. A rare few hold two
              independent jokes in a single integer and refuse to apologize.
            </p>
            <p>
              Free run to 42,069. Race the clock. Post your name. When you
              finish a free run, a face appears in the haze  -  then the counter
              politely resets, because duality is cyclical.
            </p>
            <p className="text-fg">
              The registry does not sell merch. The registry accepts
              acknowledgement, timed trials, and extremely rectangular scores.
            </p>
          </div>
        </section>

        <footer className="mt-14 border-t border-border pt-6 pb-4 text-center">
          <p className="font-mono text-[11px] tracking-wide text-subtle">
            © {new Date().getFullYear()} Registry of 42069 · Not affiliated with
            math · Very affiliated with nice
          </p>
        </footer>
      </main>

      {toast && (
        <div
          role="status"
          className="animate-fade-rise fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-border-strong bg-surface p-4 shadow-[var(--shadow-soft)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:left-auto"
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-nice">
            Milestone
          </p>
          <p className="mt-1 font-display text-xl text-fg">{toast.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{toast.body}</p>
        </div>
      )}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40",
        active
          ? "bg-accent text-accent-fg"
          : "border border-border-strong bg-surface text-muted hover:text-fg",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  variant = "ghost",
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "ghost" | "primary";
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 min-w-[44px] items-center justify-center gap-2 rounded-md px-4 text-sm font-medium tracking-tight transition-colors duration-150 active:scale-[0.96]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        variant === "primary"
          ? "bg-accent text-accent-fg hover:bg-fg"
          : "border border-border-strong bg-surface text-fg hover:bg-surface-2",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-subtle">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl tabular tracking-tight text-fg sm:text-4xl">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-surface p-5 sm:p-6",
        className,
      )}
    >
      <div className="mb-5 flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-border bg-bg text-muted">
            {icon}
          </span>
        )}
        <div>
          <h2 className="text-base font-medium tracking-tight text-fg">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
