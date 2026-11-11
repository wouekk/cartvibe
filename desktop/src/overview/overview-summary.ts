import { isWholeCalendarMonth } from "./overview-period";

/** Where the running month stands against the monthly goal, for the sentence above the Dashboard's panels. */
export interface MonthSummary {
  spent: number;
  goal: number;
  /** Days of the month still to come, today included: on the last day it is 1. */
  daysLeft: number;
  /** What is left of the goal; 0 once it is reached. */
  remaining: number;
  /** What was spent above the goal; 0 while under it. */
  over: number;
  /** What can be spent each remaining day and still end the month on the goal; 0 once it is reached. */
  perDay: number;
}

/**
 * The summary of the month that is running, or nothing: it needs a goal, a period that is one whole calendar
 * month, and today inside that month. A month that is over has no days left to plan, and a range that is not a
 * month has no monthly goal to compare with.
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

  const daysLeft = Number(to.slice(8)) - Number(today.slice(8)) + 1;
  // Money is compared in cents, so 0.1 + 0.2 never leaves a goal "0.00 short".
  const cents = (value: number) => Math.round(value * 100);
  const remainingCents = Math.max(0, cents(goal) - cents(spent));
  const overCents = Math.max(0, cents(spent) - cents(goal));

  return {
    spent,
    goal,
    daysLeft,
    remaining: remainingCents / 100,
    over: overCents / 100,
    // Rounded down to the cent: spending the figure every day never passes the goal.
    perDay: Math.floor(remainingCents / daysLeft) / 100,
  };
}
