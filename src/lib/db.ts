/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

/**
 * Runtime env access. Always read via bracket notation inside a function so
 * bundlers never freeze `process.env.DATABASE_URL` to `undefined` at build time
 * (Vercel injects it only in the live serverless process).
 */
function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  try {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

function readDatabaseUrl(): string | undefined {
  return (
    readEnv("DATABASE_URL") ||
    readEnv("POSTGRES_URL") ||
    readEnv("POSTGRES_PRISMA_URL") ||
    readEnv("NEON_DATABASE_URL")
  );
}

/**
 * Detect serverless (Vercel/Lambda/etc.). PGLite WASM data files do not resolve
 * under `/var/task` and must never be used there.
 */
function isServerlessRuntime(): boolean {
  if (
    readEnv("VERCEL") ||
    readEnv("VERCEL_ENV") ||
    readEnv("AWS_LAMBDA_FUNCTION_NAME") ||
    readEnv("AWS_EXECUTION_ENV") ||
    readEnv("NETLIFY") ||
    readEnv("FUNCTION_TARGET") ||
    readEnv("K_SERVICE")
  ) {
    return true;
  }
  try {
    if (typeof process !== "undefined" && process.cwd?.() === "/var/task") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function getDbSource(): DbSource {
  if (readDatabaseUrl()) return "neon";
  if (isServerlessRuntime()) return "neon";
  return "pglite";
}

export const dbSource: DbSource = getDbSource();

export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __neonMigrateChain__?: Promise<void>;
};

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1)
      text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ) => run<T>(text, params);
  return sql;
}

function loadMigrationFiles(): { name: string; text: string }[] {
  const migrations = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  return Object.entries(migrations)
    .map(([path, text]) => ({
      name: path.split("/").pop() as string,
      text,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Neon via HTTP fetch (`@neondatabase/serverless`). This is the durable global
 * store for every deployed player  -  not per-instance memory, not browser-only.
 */
function createNeonSql(connectionString: string): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    const { neon } = await import("@neondatabase/serverless");
    // HTTP driver: works on Vercel/Lambda cold starts without sticky TCP sockets.
    const client = neon(connectionString, {
      // Return plain row arrays (default)  -  matches our Sql surface.
      fullResults: false,
      disableWarningInBrowsers: true,
    });

    const run: Run = async <T>(text: string, params: unknown[]) => {
      const rows = await client.query(text, params ?? []);
      // neon.query returns row objects; normalize bigint-ish fields to number.
      return (rows as Record<string, unknown>[]).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          out[k] = typeof v === "bigint" ? Number(v) : v;
        }
        return out as T;
      });
    };

    // Apply pending migrations (statement-safe: one HTTP query at a time).
    globalRef.__neonMigrateChain__ ??= (async () => {
      await run(
        `create table if not exists _migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )`,
        [],
      );
      const doneRows = await run<{ name: string }>(
        "select name from _migrations",
        [],
      );
      const done = new Set(doneRows.map((r) => r.name));

      for (const { name, text } of loadMigrationFiles()) {
        if (done.has(name)) continue;
        // Neon HTTP is one-statement-per-request. Split on semicolon newlines
        // (migration files are simple DDL; no procedure bodies).
        const statements = text
          .split(/;\s*(?:\r?\n|$)/)
          .map((s) =>
            s
              .split("\n")
              .filter((line) => !/^\s*--/.test(line))
              .join("\n")
              .trim(),
          )
          .filter((s) => s.length > 0);

        try {
          for (const stmt of statements) {
            await run(stmt, []);
          }
          await run("insert into _migrations (name) values ($1)", [name]);
        } catch (err) {
          // If a concurrent instance already applied it, ignore unique violation.
          const msg = err instanceof Error ? err.message : String(err);
          if (/duplicate|unique|already exists/i.test(msg)) {
            try {
              await run(
                "insert into _migrations (name) values ($1) on conflict (name) do nothing",
                [name],
              );

            } catch {
              /* ignore */
            }
            continue;
          }
          throw err;
        }
      }
    })().catch((err) => {
      globalRef.__neonMigrateChain__ = undefined;
      throw err;
    });
    await globalRef.__neonMigrateChain__;

    return toSql(run);
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  if (isServerlessRuntime()) {
    throw new Error(
      "Database unavailable: PGLite cannot run in serverless. DATABASE_URL (Neon) is required for the global leaderboard.",
    );
  }

  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  const migrate = async (): Promise<void> => {
    const doneRows = await pg.query<{ name: string }>(
      "select name from _migrations",
    );
    const done = new Set(doneRows.rows.map((r) => r.name));
    for (const { name, text } of loadMigrationFiles()) {
      if (done.has(name)) continue;
      await pg.transaction(async (tx) => {
        await tx.exec(text);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  return toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  });
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only  -  call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }

  const url = readDatabaseUrl();
  if (url) return createNeonSql(url);

  if (isServerlessRuntime()) {
    throw new Error(
      "DATABASE_URL is not set. Falling back to remote global board.",
    );
  }


  return createPgliteSql();
}

/**
 * Shared server-only SQL client.
 * - **Deployed:** Neon Postgres (global, durable, all players)
 * - **Local preview:** PGLite (embedded, process-local)
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null;
    throw err;
  });
  return sqlPromise;
}

/** True when scores are written to shared Neon (not just this device/process). */
export function isGlobalDbConfigured(): boolean {
  return Boolean(readDatabaseUrl());
}

export async function getPglite(): Promise<
  import("@electric-sql/pglite").PGlite
> {
  if (readDatabaseUrl() || isServerlessRuntime()) {
    throw new Error(
      "getPglite() is only available on the PGLite fallback (no DATABASE_URL)",
    );
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

export function ensureDbReady(): Promise<void> {
  if (readDatabaseUrl() || isServerlessRuntime()) return Promise.resolve();
  return getSql().then(() => undefined);
}

const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (
  typeof window === "undefined" &&
  !readDatabaseUrl() &&
  !isServerlessRuntime()
) {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", err);
    throw err;
  });
}
