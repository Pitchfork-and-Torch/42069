/**
 * Shared remote leaderboard store for deployed apps when DATABASE_URL / Neon
 * is not injected. Uses a public JSON bin over HTTPS so every serverless
 * instance reads/writes the same durable document  -  true multi-player ranks.
 *
 * Prefer Neon (getSql) when available; this is the production fallback only.
 */
import type { BoardMode, LeaderboardRow } from "@/lib/leaderboard-types";

/** Fixed bin for 42069.grok.me global ranks (extendsclass free JSON storage). */
const BIN_ID = "aebebbc";
const BIN_URL = `https://extendsclass.com/api/json-storage/bin/${BIN_ID}`;

type RemoteDoc = {
  version: number;
  scores: LeaderboardRow[];
  app?: string;
};

const EMPTY: RemoteDoc = {
  version: 1,
  scores: [],
  app: "42069.grok.me",
};

// Serialize writes on a warm instance so we don't stomp ourselves.
const globalRef = globalThis as typeof globalThis & {
  __remoteLbChain__?: Promise<unknown>;
};

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalRef.__remoteLbChain__ ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  globalRef.__remoteLbChain__ = prev.then(() => gate);
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
  }
}

async function fetchDoc(): Promise<RemoteDoc> {
  const res = await fetch(BIN_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Remote board read failed (${res.status})`);
  }
  const data = (await res.json()) as Partial<RemoteDoc>;
  const scores = Array.isArray(data.scores)
    ? data.scores.filter(isRow)
    : [];
  return {
    version: Number(data.version) || 1,
    scores,
    app: "42069.grok.me",
  };
}

async function saveDoc(doc: RemoteDoc): Promise<void> {
  const res = await fetch(BIN_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(doc),
  });
  if (!res.ok) {
    throw new Error(`Remote board write failed (${res.status})`);
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

function sortMode(
  rows: LeaderboardRow[],
  mode: BoardMode,
  limit: number,
): LeaderboardRow[] {
  const filtered = rows.filter((r) => r.mode === mode);
  if (mode === "free_run") {
    return filtered
      .filter((r) => r.durationMs != null && r.score >= 42069)
      .sort((a, b) => {
        const da = a.durationMs ?? Number.MAX_SAFE_INTEGER;
        const db = b.durationMs ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      })
      .slice(0, limit);
  }
  return filtered
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    })
    .slice(0, limit);
}

export async function remoteList(
  mode: BoardMode,
  limit: number,
): Promise<LeaderboardRow[]> {
  try {
    const doc = await fetchDoc();
    return sortMode(doc.scores, mode, limit);
  } catch (err) {
    console.error("[remote-board] list failed:", err);
    return [];
  }
}

export async function remoteInsert(input: {
  name: string;
  mode: BoardMode;
  score: number;
  durationMs: number | null;
}): Promise<{ ok: true; id: number }> {
  return withLock(async () => {
    // Retry a few times against concurrent writers on other instances.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const doc = await fetchDoc().catch(() => ({ ...EMPTY, scores: [] as LeaderboardRow[] }));
        const id = Date.now() + Math.floor(Math.random() * 1000);
        const row: LeaderboardRow = {
          id,
          name: input.name.slice(0, 24),
          mode: input.mode,
          score: input.score,
          durationMs: input.durationMs,
          createdAt: new Date().toISOString(),
        };
        const scores = [row, ...doc.scores].slice(0, 500);
        await saveDoc({
          version: (doc.version || 1) + 1,
          scores,
          app: "42069.grok.me",
        });
        return { ok: true as const, id };
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("Remote board insert failed");
  });
}

export async function remoteMeta(): Promise<{ totalScores: number }> {
  try {
    const doc = await fetchDoc();
    return { totalScores: doc.scores.length };
  } catch {
    return { totalScores: 0 };
  }
}
