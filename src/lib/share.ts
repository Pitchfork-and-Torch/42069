import { BOARD_LABELS, type BoardMode } from "@/lib/leaderboard-types";
import { formatDuration, formatInt } from "@/lib/format";

export const GAME_URL = "https://42069.grok.me";

export type Scorecard = {
  mode: BoardMode;
  score: number;
  durationMs?: number | null;
  name?: string;
};

/** Build a copy-ready scorecard for X. */
export function buildScorecardText(card: Scorecard): string {
  const who = card.name?.trim() ? card.name.trim() : "A dualist";
  const label = BOARD_LABELS[card.mode];

  if (card.mode === "free_run") {
    const time = formatDuration(card.durationMs ?? 0);
    return [
      `${who} just hit Absolute Duality on the Official Registry of 42069.`,
      ``,
      `Free run · ${formatInt(card.score)} taps · ${time}`,
      `Half blaze. Half nice. Fully documented.`,
      ``,
      `Play: ${GAME_URL}`,
    ].join("\n");
  }

  return [
    `${who} just crushed a timed trial on the Official Registry of 42069.`,
    ``,
    `${label} · ${formatInt(card.score)} taps`,
    `Documented · Dual · Binding`,
    ``,
    `Play: ${GAME_URL}`,
  ].join("\n");
}

/** X (Twitter) intent URL  -  opens compose with the scorecard prefilled. */
export function buildTweetIntentUrl(card: Scorecard): string {
  const text = buildScorecardText(card);
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", text);
  return url.toString();
}

/**
 * Open the X compose intent (auto-fills the scorecard tweet).
 * Falls back to copying the text if the popup is blocked.
 */
export function shareScorecardToX(card: Scorecard): {
  opened: boolean;
  text: string;
  intentUrl: string;
} {
  const text = buildScorecardText(card);
  const intentUrl = buildTweetIntentUrl(card);
  let opened = false;
  try {
    const w = window.open(intentUrl, "_blank", "noopener,noreferrer");
    opened = Boolean(w);
  } catch {
    opened = false;
  }
  return { opened, text, intentUrl };
}
