import { isWholeCalendarMonth } from "./overview-period";

/** Where the running month stands against the monthly goal, for the sentence above the Dashboard's panels. */
export interface MonthSummary {
  spent: number;
  goal: number;
  /** What is left of the goal; 0 once it is reached. */
  remaining: number;
  /** What was spent above the goal; 0 while under it. */
  over: number;
}

/** One stretch of the sentence: plain words, the bold lead, or the part that says where the month stands. */
export interface SentencePart {
  text: string;
  style: "plain" | "lead" | "verdict";
}

/**
 * Splits a translated sentence at its marks: `<b>…</b>` is the lead and `<mark>…</mark>` the verdict. The marks
 * travel inside the translation, so each language keeps its own word order and the page never glues fragments
 * together. A sentence without marks is one plain part; a mark left open is shown as it was typed.
 */
export function sentenceParts(sentence: string): SentencePart[] {
  const parts: SentencePart[] = [];
  const marked = /<(b|mark)>(.*?)<\/\1>/g;
  let at = 0;
  for (const match of sentence.matchAll(marked)) {
    if (match.index > at) {
      parts.push({ text: sentence.slice(at, match.index), style: "plain" });
    }
    if (match[2]) {
      parts.push({ text: match[2], style: match[1] === "b" ? "lead" : "verdict" });
    }
    at = match.index + match[0].length;
  }
  if (at < sentence.length) {
    parts.push({ text: sentence.slice(at), style: "plain" });
  }
  return parts;
}

/**
 * The summary of the month that is running, or nothing: it needs a goal, a period that is one whole calendar
 * month, and today inside that month. A month that is over is no longer the one being lived, and a range that is
 * not a month has no monthly goal to compare with.
 *
 * `from`, `to` and `today` are calendar days as "yyyy-MM-dd"; `today` is the day in the app time zone.
 */
export function monthSummary(
  spent: number,
  goal: number,
  from: string | undefined,
  to: string | undefined,
  today: string
): MonthSummary | undefined {
  if (!(goal > 0) || !Number.isFinite(spent) || !from || !to || !isWholeCalendarMonth(from, to)) {
    return undefined;
  }
  if (today < from || today > to) {
    return undefined;
  }

  // Money is compared in cents, so 0.1 + 0.2 never leaves a goal "0.00 short".
  const cents = (value: number) => Math.round(value * 100);
  const remainingCents = Math.max(0, cents(goal) - cents(spent));
  const overCents = Math.max(0, cents(spent) - cents(goal));

  return {
    spent,
    goal,
    remaining: remainingCents / 100,
    over: overCents / 100,
  };
}
