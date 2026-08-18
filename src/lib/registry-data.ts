export const SACRED = 42069;

export const MILESTONES: { at: number; title: string; body: string }[] = [
  {
    at: 1,
    title: "First contact",
    body: "You have acknowledged the number. There is no going back.",
  },
  {
    at: 69,
    title: "Nice.",
    body: "The dualities align. A modest ceremony has been logged.",
  },
  {
    at: 420,
    title: "Blaze protocol",
    body: "Atmospheric conditions reclassified as theoretically optimal.",
  },
  {
    at: 690,
    title: "Nice × 10",
    body: "Your tap count has entered scientific notation. Kind of.",
  },
  {
    at: 4200,
    title: "Near-enlightenment",
    body: "You are 10% of the way to Absolute Duality. Remain calm.",
  },
  {
    at: 6900,
    title: "Senior Nice Officer",
    body: "HR has prepared a plaque. It is extremely rectangular.",
  },
  {
    at: 21000,
    title: "Halfway to forever",
    body: "Half of 42069 is not nice. This is considered tragic.",
  },
  {
    at: SACRED,
    title: "Absolute Duality",
    body: "42,069 taps. A face appears in the haze. The counter resets.",
  },
];

export const ORACLES = [
  "A stranger will say "nice" today. Do not correct them.",
  "The optimal time is always 4:20 or 6:09. Never both. Except sometimes.",
  "Your next meeting will be 69% more productive if you pretend it is not.",
  "Blaze only that which deserves blazing. Most things do not. Some do.",
  "A number between 1 and 100 wants to be you when it grows up.",
  "Today's vibe is legally classified as: mildly excellent.",
  "If you reverse 42069 you get 96024. Do not reverse it.",
  "The universe is dual. So is this sentence. Nice.",
  "Someone nearby is thinking about snacks. This is cosmically relevant.",
  "Your posture has improved 4.2%. Keep the other 0.069% for later.",
  "A bird will fly overhead. Interpret nothing. Enjoy everything.",
  "The sacred number neither judges nor files taxes.",
  "You already know what to do. It is either rest or water.",
  "69 is nice. 420 is fine. 42069 is policy.",
  "Avoid numbers that try too hard. 42070 is trying too hard.",
  "Timed trials exist so you can be competitively ridiculous.",
  "The leaderboard remembers. The haze forgets. Both are correct.",
];

export const TICKER_ITEMS = [
  "NICE futures +6.9%",
  "Blaze Index steady at 420.00",
  "Duality ETF opens higher",
  "Registry confirms: still nice",
  "Atmospheric board: green",
  "42069 holds all-time high of itself",
  "Analysts: "we have no notes"",
  "Vol of vibe: moderately elevated",
  "Timed trials now open",
  "Leaderboard accepting rectangular scores",
  "Short interest in un-nice: collapsing",
  "After-hours: extremely rectangular",
];

export const FACTS = [
  {
    label: "Prime factors",
    value: "3 × 14023",
    note: "Neither is particularly funny. The product is.",
  },
  {
    label: "Binary",
    value: "1010010001010101",
    note: "Looks important. Is important. Ends in 01.",
  },
  {
    label: "Roman",
    value: "XLMMMXIX",
    note: "Romans did not have a word for this energy.",
  },
  {
    label: "Hours in dual form",
    value: "11.686 days",
    note: "Approximately one long weekend of contemplation.",
  },
  {
    label: "Free-run goal",
    value: "42,069 taps",
    note: "Completion summons the haze. Then the counter resets.",
  },
  {
    label: "Official status",
    value: "Documented",
    note: "This page is the documentation. Congratulations.",
  },
];

export function auditNumber(n: number): {
  score: number;
  grade: string;
  summary: string;
  bullets: string[];
} {
  if (!Number.isFinite(n)) {
    return {
      score: 0,
      grade: "VOID",
      summary: "That is not a number the registry recognizes.",
      bullets: ["Try an integer.", "Preferably a funny one."],
    };
  }

  const abs = Math.abs(Math.trunc(n));
  const digits = String(abs);
  let score = 12;
  const bullets: string[] = [];

  if (abs === SACRED) {
    return {
      score: 100,
      grade: "ABSOLUTE",
      summary: "This is the number. Further analysis is ceremonial.",
      bullets: [
        "Contains both 420 and 69 as contiguous substrings.",
        "Needs no improvement.",
        "May be framed.",
      ],
    };
  }

  if (digits.includes("69")) {
    score += 34;
    bullets.push("Contains the classic "69" motif. Nice.");
  }
  if (digits.includes("420")) {
    score += 34;
    bullets.push("Contains the classic "420" motif. Blaze-adjacent.");
  }
  if (digits.includes("42")) {
    score += 8;
    bullets.push("Hints at 42  -  adjacent cosmic humor.");
  }
  if (abs % 69 === 0 && abs !== 0) {
    score += 12;
    bullets.push("Divisible by 69. The auditors nodded once.");
  }
  if (abs % 420 === 0 && abs !== 0) {
    score += 12;
    bullets.push("Divisible by 420. Atmospheric clearance granted.");
  }
  if (digits === digits.split("").reverse().join("") && digits.length > 1) {
    score += 10;
    bullets.push("Palindrome detected. Mirror energy is strong.");
  }
  if (abs === 0) {
    score = 4;
    bullets.push("Zero is a clean slate, not a personality.");
  }
  if (abs > 1_000_000) {
    score -= 6;
    bullets.push("Very large. Trying a bit hard.");
  }

  score = Math.max(0, Math.min(99, score));

  let grade = "MEH";
  let summary = "Serviceable. Not dual. Not sacred. Adequately numeric.";
  if (score >= 85) {
    grade = "HIGHLY NICE";
    summary = "Strong dual energy. Eligible for a quiet standing ovation.";
  } else if (score >= 65) {
    grade = "RESPECTABLE";
    summary = "Shows promise. Would survive a casual group chat.";
  } else if (score >= 40) {
    grade = "ORBITAL";
    summary = "Circling the vibe without landing. Keep iterating.";
  } else if (score >= 20) {
    grade = "BASELINE";
    summary = "A number doing number things. No citations issued.";
  }

  if (bullets.length === 0) {
    bullets.push("No dual motifs detected.");
    bullets.push("Consider adding a 6, a 9, a 4, a 2, or a 0.");
  }

  return { score, grade, summary, bullets };
}

export function randomOracle(seed = Date.now()) {
  return ORACLES[Math.abs(seed) % ORACLES.length]!;
}
