/**
 * Global leaderboard persistence  -  shared by every player.
 *
 * Priority:
 *  1. Neon Postgres when DATABASE_URL is set (platform injects on deploy)
 *  2. Remote JSON store (serverless without Neon)  -  durable + multi-instance
 *  3. PGLite (local / preview only)
 *
 * Never surface "DATABASE_URL is not set" to players  -  fall through to the
 * remote global store instead.
 */
import {
  getSql,
  isGlobalDbConfigured,
  type Sql,
} from "@/lib/db";
import {
  remoteInsert,
  remoteList,
  remoteMeta,
} from "@/lib/remote-board";
import type { BoardMode, LeaderboardRow } from "@/lib/leaderboard-types";

export type BoardStorage = "neon" | "remote" | "pglite";

const globalLb = globalThis as typeof globalThis & {
  __registryLbTableReady__?: Promise<void>;
};

function isServerless(): boolean {
  if (typeof process === "undefined") return false;
  try {
    const e = process.env;
    return Boolean(
      e["VERCEL"] ||
        e["VERCEL_ENV"] ||
        e["AWS_LAMBDA_FUNCTION_NAME"] ||
        e["AWS_EXECUTION_ENV"] ||
        (typeof process.cwd === "function" && process.cwd() === "/var/task"),
    );
  } catch {
    return false;
  }
}

async function ensureTable(sql: Sql): Promise<void> {
  globalLb.__registryLbTableReady__ ??= (async () => {
    await sql.query(`
      create table if not exists leaderboard_scores (
        id          serial primary key,
        name        text not null,
        mode        text not null,
        score       integer not null,
        duration_ms integer,
        created_at  timestamptz not null default now()
      )
    `);
    await sql.query(`
      create index if not exists leaderboard_scores_mode_score_idx
        on leaderboard_scores (mode, score desc, created_at asc)
    `);
    await sql.query(`
      create index if not exists leaderboard_scores_mode_duration_idx
        on leaderboard_scores (mode, duration_ms asc, created_at asc)
    `);
  })().catch((err) => {
    globalLb.__registryLbTableReady__ = undefined;
    throw err;
  });
  await globalLb.__registryLbTableReady__;
}

function mapSqlRow(r: {
  id: number;
  name: string;
  mode: string;
  score: number;
  duration_ms: number | null;
  created_at: string;
}): LeaderboardRow {
  return {
    id: Number(r.id),
    name: r.name,
    mode: r.mode,
    score: Number(r.score),
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    createdAt: String(r.created_at),
  };
}

async function listFromSql(
  sql: Sql,
  mode: BoardMode,
  limit: number,
): Promise<LeaderboardRow[]> {
  await ensureTable(sql);
  if (mode === "free_run") {
    const rows = await sql<{
      id: number;
      name: string;
      mode: string;
      score: number;
      duration_ms: number | null;
      created_at: string;
    }>`
      select id, name, mode, score, duration_ms, created_at::text as created_at
      from leaderboard_scores
      where mode = ${mode}
        and duration_ms is not null
        and score >= 42069
      order by duration_ms asc, created_at asc
      limit ${limit}
    `;
    return rows.map(mapSqlRow);
  }
  const rows = await sql<{
    id: number;
    name: string;
    mode: string;
    score: number;
    duration_ms: number | null;
    created_at: string;
  }>`
    select id, name, mode, score, duration_ms, created_at::text as created_at
    from leaderboard_scores
    where mode = ${mode}
    order by score desc, created_at asc
    limit ${limit}
  `;
  return rows.map(mapSqlRow);
}

async function insertSql(
  sql: Sql,
  input: {
    name: string;
    mode: BoardMode;
    score: number;
    durationMs: number | null;
  },
): Promise<number> {
  await ensureTable(sql);
  const rows = await sql<{ id: number }>`
    insert into leaderboard_scores (name, mode, score, duration_ms)
    values (${input.name}, ${input.mode}, ${input.score}, ${input.durationMs})
    returning id
  `;
  const id = rows[0]?.id;
  if (id == null) throw new Error("Insert failed  -  no id returned");
  return Number(id);
}

/** Try SQL (Neon/PGLite). Returns null when SQL is unavailable. */
async function trySql(): Promise<Sql | null> {
  try {
    // On serverless without DATABASE_URL, getSql throws  -  catch and use remote.
    if (isServerless() && !isGlobalDbConfigured()) return null;
    return await getSql();
  } catch (err) {
    console.error("[leaderboard] SQL unavailable:", err);
    return null;
  }
}

export async function listLeaderboard(
  mode: BoardMode,
  limit: number,
): Promise<LeaderboardRow[]> {
  const sql = await trySql();
  if (sql) {
    try {
      return await listFromSql(sql, mode, limit);
    } catch (err) {
      console.error("[leaderboard] SQL list failed, trying remote:", err);
    }
  }
  // Deployed without Neon, or SQL failed → shared remote store
  if (isServerless() || !sql) {
    return remoteList(mode, limit);
  }
  return [];
}

export async function insertLeaderboardScore(input: {
  name: string;
  mode: BoardMode;
  score: number;
  durationMs: number | null;
}): Promise<{ ok: true; id: number; storage: BoardStorage }> {
  const sql = await trySql();
  if (sql) {
    try {
      const id = await insertSql(sql, input);
      return {
        ok: true,
        id,
        storage: isGlobalDbConfigured() ? "neon" : "pglite",
      };
    } catch (err) {
      console.error("[leaderboard] SQL insert failed, trying remote:", err);
    }
  }

  // Global remote fallback (works on Vercel without DATABASE_URL)
  const res = await remoteInsert(input);
  return { ok: true, id: res.id, storage: "remote" };
}

export async function getLeaderboardMeta(): Promise<{
  global: boolean;
  backend: BoardStorage;
  totalScores: number;
}> {
  const sql = await trySql();
  if (sql) {
    try {
      await ensureTable(sql);
      const rows = await sql<{ n: number }>`
        select count(*)::int as n from leaderboard_scores
      `;
      const totalScores = Number(rows[0]?.n ?? 0);
      const global = isGlobalDbConfigured();
      return {
        global,
        backend: global ? "neon" : "pglite",
        totalScores,
      };
    } catch (err) {
      console.error("[leaderboard] SQL meta failed:", err);
    }
  }

  const meta = await remoteMeta();
  return {
    global: true, // remote is shared across all players
    backend: "remote",
    totalScores: meta.totalScores,
  };
}
