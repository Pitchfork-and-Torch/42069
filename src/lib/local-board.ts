import type { BoardMode, LeaderboardRow } from "@/lib/leaderboard-types";

const KEY = "registry-lb-local-v1";
const MAX = 200;

type Store = { rows: LeaderboardRow[] };

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { rows: [] };
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.rows)) return { rows: [] };
    return { rows: parsed.rows.filter(isRow) };
  } catch {
    return { rows: [] };
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

function isRow(r: unknown): r is LeaderboardRow {
  if (!r || typeof r !== "object") return false;
  const o = r as LeaderboardRow;
  return (
    typeof o.id === "number" &&
    typeof o.name === "string" &&
    typeof o.mode === "string" &&
    typeof o.score === "number"
  );
}

/** Persist a score on this device so the board never "forgets" your posts. */
export function saveLocalScore(input: {
  id?: number;
  name: string;
  mode: BoardMode;
  score: number;
  durationMs: number | null;
}): LeaderboardRow {
  const store = read();
  const row: LeaderboardRow = {
    id: input.id ?? Date.now(),
    name: input.name.slice(0, 24),
    mode: input.mode,
    score: input.score,
    durationMs: input.durationMs,
    createdAt: new Date().toISOString(),
  };
  // Dedupe near-identical posts (same name/mode/score within 30s)
  const filtered = store.rows.filter((r) => {
    if (r.mode !== row.mode || r.name !== row.name || r.score !== row.score)
      return true;
    const dt = Math.abs(
      new Date(r.createdAt).getTime() - new Date(row.createdAt).getTime(),
    );
    return dt > 30_000;
  });
  filtered.unshift(row);
  if (filtered.length > MAX) filtered.length = MAX;
  write({ rows: filtered });
  return row;
}

export function listLocalScores(mode: BoardMode): LeaderboardRow[] {
  return read().rows.filter((r) => r.mode === mode);
}

/** Merge remote (authoritative when present) with local device scores. */
export function mergeBoardRows(
  remote: LeaderboardRow[],
  local: LeaderboardRow[],
  mode: BoardMode,
  limit: number,
): LeaderboardRow[] {
  const byKey = new Map<string, LeaderboardRow>();
  const keyOf = (r: LeaderboardRow) =>
    `${r.mode}|${r.name.toLowerCase()}|${r.score}|${r.durationMs ?? ""}`;

  for (const r of remote) {
    if (r.mode === mode) byKey.set(keyOf(r), r);
  }
  for (const r of local) {
    if (r.mode !== mode) continue;
    const k = keyOf(r);
    if (!byKey.has(k)) byKey.set(k, r);
  }

  const all = [...byKey.values()];
  if (mode === "free_run") {
    return all
      .filter((r) => r.durationMs != null && r.score >= 42069)
      .sort((a, b) => {
        const da = a.durationMs ?? Number.MAX_SAFE_INTEGER;
        const db = b.durationMs ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return a.createdAt.localeCompare(b.createdAt);
      })
      .slice(0, limit);
  }
  return all
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, limit);
}
