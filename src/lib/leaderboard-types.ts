export const TRIAL_MODES = ["trial_42", "trial_69", "trial_420"] as const;
export type TrialMode = (typeof TRIAL_MODES)[number];

export const BOARD_MODES = [
  "trial_42",
  "trial_69",
  "trial_420",
  "free_run",
] as const;
export type BoardMode = (typeof BOARD_MODES)[number];

export const TRIAL_CONFIG: Record<
  TrialMode,
  { label: string; seconds: number; blurb: string }
> = {
  trial_42: {
    label: "42s Sprint",
    seconds: 42,
    blurb: "Maximum taps in 42 seconds. The answer is speed.",
  },
  trial_69: {
    label: "69s Nice Run",
    seconds: 69,
    blurb: "A slightly longer, slightly nicer window.",
  },
  trial_420: {
    label: "420s Endurance",
    seconds: 420,
    blurb: "Seven full minutes of formal acknowledgement.",
  },
};

export const BOARD_LABELS: Record<BoardMode, string> = {
  trial_42: "42s Sprint",
  trial_69: "69s Nice Run",
  trial_420: "420s Endurance",
  free_run: "Free Run (fastest to 42,069)",
};

export type LeaderboardRow = {
  id: number;
  name: string;
  mode: string;
  score: number;
  durationMs: number | null;
  createdAt: string;
};
