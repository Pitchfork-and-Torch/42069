import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getLeaderboardMeta,
  insertLeaderboardScore,
  listLeaderboard,
  type BoardStorage,
} from "@/lib/leaderboard-store";
import {
  BOARD_LABELS,
  BOARD_MODES,
  TRIAL_CONFIG,
  TRIAL_MODES,
  type BoardMode,
  type LeaderboardRow,
  type TrialMode,
} from "@/lib/leaderboard-types";

export {
  BOARD_LABELS,
  BOARD_MODES,
  TRIAL_CONFIG,
  TRIAL_MODES,
  type BoardMode,
  type LeaderboardRow,
  type TrialMode,
  type BoardStorage,
};

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[a-zA-Z0-9 _.\-']+$/, "Use letters, numbers, spaces, . _ - ' only");

const submitSchema = z.object({
  name: nameSchema,
  mode: z.enum(BOARD_MODES),
  score: z.number().int().min(0).max(5_000_000),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
});

/**
 * Ceiling for timed trials. Hero clicks can land up to base 5 × streak mult 7
 * = 35 taps per click; skilled mashers clear several thousand in 42s. The old
 * cap (seconds × 80) falsely rejected real scores like 4,715.
 */
function trialScoreCeiling(mode: BoardMode): number {
  const seconds =
    mode === "trial_42" ? 42 : mode === "trial_69" ? 69 : mode === "trial_420" ? 420 : 0;
  // ~35 taps/click × ~15 clicks/s is the mechanical upper bound; keep headroom.
  return seconds * 35 * 16;
}

export const getLeaderboard = createServerFn({ method: "GET" })
  .validator(
    z.object({
      mode: z.enum(BOARD_MODES),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(async ({ data }): Promise<LeaderboardRow[]> => {
    return listLeaderboard(data.mode, data.limit ?? 20);
  });

export const submitScore = createServerFn({ method: "POST" })
  .validator(submitSchema)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; id: number; storage: BoardStorage }> => {
      const name = data.name.trim().slice(0, 24);
      const durationMs =
        data.durationMs === undefined || data.durationMs === null
          ? null
          : data.durationMs;

      if (data.mode === "free_run") {
        if (data.score < 42069) {
          throw new Error("Free-run requires reaching 42069 taps.");
        }
        if (durationMs !== null && durationMs < 3000) {
          throw new Error("That was suspiciously fast.");
        }
      } else {
        const maxScore = trialScoreCeiling(data.mode);
        if (data.score > maxScore) {
          throw new Error("Score rejected by the registry auditors.");
        }
      }

      return insertLeaderboardScore({
        name,
        mode: data.mode,
        score: data.score,
        durationMs,
      });
    },
  );

export const getBoardStatus = createServerFn({ method: "GET" }).handler(
  async () => getLeaderboardMeta(),
);
