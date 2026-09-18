import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { submitScore, type BoardMode } from "@/lib/leaderboard";
import { saveLocalScore } from "@/lib/local-board";
import { formatDuration, formatInt } from "@/lib/format";
import { buildScorecardText, shareScorecardToX } from "@/lib/share";
import { cn } from "@/lib/utils";

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

function isHardReject(message: string): boolean {
  return /rejected by the registry|suspiciously fast|requires reaching/i.test(
    message,
  );
}

export function ScoreSubmit({
  mode,
  score,
  durationMs,
  defaultName,
  onName,
  onSubmitted,
  onSkip,
}: {
  mode: BoardMode;
  score: number;
  durationMs?: number | null;
  defaultName: string;
  onName?: (name: string) => void;
  onSubmitted: (info: { mode: BoardMode; name: string }) => void;
  onSkip?: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const cleanName = () => (name.trim() || "Dualist").slice(0, 24);

  const postToBoard = async (who: string) => {
    const result = await submitScore({
      data: {
        name: who,
        mode,
        score,
        durationMs: durationMs ?? null,
      },
    });
    saveLocalScore({
      id: result.id,
      name: who,
      mode,
      score,
      durationMs: durationMs ?? null,
    });
    onName?.(who);
    setDone(true);
    onSubmitted({ mode, name: who });
    return result;
  };

  const submitOnly = async () => {
    setBusy(true);
    setError(null);
    const who = cleanName();
    try {
      await postToBoard(who);
      setShareNote("Posted to the global leaderboard.");
      window.setTimeout(() => setShareNote(null), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed";
      if (isHardReject(msg)) {
        // Don't pretend it ranked  -  anti-cheat / validation reject.
        setError(msg);
        setDone(false);
      } else {
        // Network / store hiccup: keep a device mirror and still share.
        saveLocalScore({
          name: who,
          mode,
          score,
          durationMs: durationMs ?? null,
        });
        setDone(true);
        onName?.(who);
        onSubmitted({ mode, name: who });
        setError(`${msg}  -  saved on this device; retry Post if missing.`);
      }
    } finally {
      setBusy(false);
    }
  };

  /** Post to the board, then open X with a prefilled scorecard. */
  const postAndShare = async () => {
    setBusy(true);
    setError(null);
    const who = cleanName();
    let posted = done;
    try {
      if (!done) {
        try {
          await postToBoard(who);
          posted = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Submit failed";
          if (isHardReject(msg)) {
            setError(msg);
            // Still allow sharing the scorecard tweet.
          } else {
            saveLocalScore({
              name: who,
              mode,
              score,
              durationMs: durationMs ?? null,
            });
            setDone(true);
            onName?.(who);
            onSubmitted({ mode, name: who });
            posted = true;
            setError(`${msg}  -  saved on this device.`);
          }
        }
      }
      const result = shareScorecardToX({
        mode,
        score,
        durationMs: durationMs ?? null,
        name: who,
      });
      if (result.opened) {
        setShareNote(
          posted
            ? "Posted to the board · scorecard opened on X  -  hit Post."
            : "Scorecard opened on X  -  fix the board error, then Post again.",
        );
      } else {
        try {
          await navigator.clipboard.writeText(result.text);
          setCopied(true);
          setShareNote(
            posted
              ? "Posted · popup blocked  -  scorecard copied for X."
              : "Scorecard copied  -  board post still needs a retry.",
          );
        } catch {
          setShareNote("Use Copy if X didn't open.");
        }
      }
      window.setTimeout(() => setShareNote(null), 6000);
    } finally {
      setBusy(false);
    }
  };

  const copyScorecard = async () => {
    try {
      await navigator.clipboard.writeText(
        buildScorecardText({
          mode,
          score,
          durationMs: durationMs ?? null,
          name: cleanName(),
        }),
      );
      setCopied(true);
      setShareNote("Scorecard copied.");
      window.setTimeout(() => {
        setCopied(false);
        setShareNote(null);
      }, 2000);
    } catch {
      setShareNote("Could not copy  -  use Post & Share instead.");
    }
  };

  return (
    <div className="rounded-xl border border-border-strong bg-surface p-5 shadow-[var(--shadow-soft)]">
      <p className="font-mono text-[11px] uppercase tracking-wider text-nice">
        Cycle complete
      </p>
      <p className="mt-1 font-display text-2xl text-fg">
        {mode === "free_run"
          ? formatDuration(durationMs ?? 0)
          : `${formatInt(score)} taps`}
      </p>
      <p className="mt-1 text-sm text-muted">
        Tweets alone don't rank.{" "}
        <span className="text-fg">Post & Share</span> saves you on the board
        and opens X with your scorecard.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-subtle">
          Display name
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 24))}
          maxLength={24}
          disabled={busy}
          className="h-11 w-full rounded-md border border-border-strong bg-bg px-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-nice/60 focus:ring-2 focus:ring-nice/20 disabled:opacity-60"
          placeholder="Dualist"
        />
      </label>

      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
      {shareNote && (
        <p className="mt-2 text-sm text-muted" role="status">
          {shareNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void postAndShare()}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
            "bg-fg text-bg transition-transform duration-150 active:scale-[0.96]",
            "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40",
          )}
        >
          <XLogo className="size-3.5" />
          {busy ? "Working..." : done ? "Share again on X" : "Post & Share on X"}
        </button>

        <button
          type="button"
          disabled={busy || done}
          onClick={() => void submitOnly()}
          className={cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
            "bg-accent text-accent-fg transition-transform duration-150 active:scale-[0.96]",
            "hover:bg-fg disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40",
          )}
        >
          {done ? (
            <>
              <Check className="size-4" /> On the board
            </>
          ) : (
            <>
              <Send className="size-4" />
              Board only
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => void copyScorecard()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-strong bg-bg px-4 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>

        {onSkip && !done && (
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-bg px-4 text-sm font-medium text-muted transition-colors hover:text-fg"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
