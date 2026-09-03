import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Trophy } from "lucide-react";
import {
  BOARD_LABELS,
  BOARD_MODES,
  getBoardStatus,
  getLeaderboard,
  type BoardMode,
  type LeaderboardRow,
} from "@/lib/leaderboard";
import { listLocalScores, mergeBoardRows } from "@/lib/local-board";
import { formatDuration, formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODE_CHIP: Record<BoardMode, string> = {
  trial_42: "42s",
  trial_69: "69s",
  trial_420: "420s",
  free_run: "Fastest",
};

export function LeaderboardPanel({
  highlightMode,
  refreshKey = 0,
}: {
  highlightMode?: BoardMode;
  refreshKey?: number;
}) {
  const [mode, setMode] = useState<BoardMode>(highlightMode ?? "trial_42");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    global: boolean;
    totalScores: number;
    backend?: string;
  } | null>(null);
  const [mergedLocal, setMergedLocal] = useState(false);

  useEffect(() => {
    if (highlightMode) setMode(highlightMode);
  }, [highlightMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [remote, meta] = await Promise.all([
        getLeaderboard({ data: { mode, limit: 25 } }),
        getBoardStatus().catch(() => null),
      ]);
      const remoteRows = Array.isArray(remote) ? remote : [];
      const local = listLocalScores(mode);
      const merged = mergeBoardRows(remoteRows, local, mode, 15);
      setRows(merged);
      setMergedLocal(remoteRows.length === 0 && local.length > 0);
      if (meta) {
        setStatus({
          global: meta.global,
          totalScores: meta.totalScores,
          backend: meta.backend,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load board";
      // Never show internal DATABASE_URL messages to players
      const friendly = /DATABASE_URL|Neon Postgres|pglite\.data|\/var\/task/i.test(
        msg,
      )
        ? "Board is waking up  -  hit Retry in a moment."
        : msg;
      setError(friendly);
      const local = listLocalScores(mode);
      setRows(mergeBoardRows([], local, mode, 15));
      setMergedLocal(local.length > 0);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const badgeLabel =
    status == null
      ? "Checking board..."
      : status.global
        ? "Live global · all players"
        : "Preview board · restarts clear ranks";

  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-border bg-bg text-muted">
            <Trophy className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-medium tracking-tight text-fg">
              Global leaderboard
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Shared ranks for every dualist. Scores persist for all players.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex size-10 items-center justify-center rounded-md border border-border-strong bg-bg text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40"
          aria-label="Refresh leaderboard"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider",
            status?.global
              ? "border-nice/40 bg-nice-dim text-nice"
              : "border-border bg-bg text-subtle",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              status?.global ? "bg-nice" : "bg-subtle",
            )}
          />
          {badgeLabel}
        </span>
        {status != null && status.totalScores > 0 && (
          <span className="font-mono text-[10px] tabular text-subtle">
            {formatInt(status.totalScores)} total entries
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {BOARD_MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "h-9 rounded-md px-3 text-xs font-medium transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nice/40",
              mode === m
                ? "bg-accent text-accent-fg"
                : "border border-border-strong bg-bg text-muted hover:text-fg",
            )}
          >
            {MODE_CHIP[m]}
          </button>
        ))}
      </div>

      <p className="mt-3 font-mono text-[11px] tracking-wide text-subtle">
        {BOARD_LABELS[mode]}
        {mode === "free_run" ? " · lower time wins" : " · higher taps win"}
        {mergedLocal ? " · + scores from this device" : ""}
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg/80 font-mono text-[10px] uppercase tracking-wider text-subtle">
            <tr>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Pilot</th>
              <th className="px-3 py-2.5 font-medium text-right">
                {mode === "free_run" ? "Time" : "Taps"}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted">
                  Loading board...
                </td>
              </tr>
            )}
            {!loading && error && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center">
                  <p className="text-sm text-warn">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-3 inline-flex h-9 items-center rounded-md border border-border-strong bg-bg px-3 text-xs font-medium text-fg hover:bg-surface-2"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted">
                  <p>No scores on this board yet.</p>
                  <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-subtle">
                    Finish a run, then hit{" "}
                    <span className="text-fg">Post & Share on X</span>. That
                    writes the global registry for every player. Use the matching
                    tab.
                  </p>
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r, i) => (
                <tr
                  key={`${r.id}-${r.name}-${r.score}-${i}`}
                  className={cn(
                    "border-t border-border",
                    i < 3 && "bg-nice-dim/40",
                  )}
                >
                  <td className="px-3 py-2.5 font-mono text-xs tabular text-subtle">
                    {i + 1}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2.5 font-medium text-fg">
                    {r.name}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm tabular text-fg">
                    {mode === "free_run"
                      ? formatDuration(r.durationMs ?? 0)
                      : formatInt(r.score)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
