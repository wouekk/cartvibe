/** Calendar-day helpers for the demo backend: plain `yyyy-MM-dd` strings and UTC arithmetic, no browser zone. */

export function parseDay(day: string): Date {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}

/** The first day of the month `months` away from the month of `day` (negative = earlier). */
export function monthStart(day: string, months = 0): string {
  const date = parseDay(day);
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

export function monthEnd(day: string, months = 0): string {
  return addDays(monthStart(day, months + 1), -1);
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** A receipt's `date` on the wire: a calendar day as midnight UTC. */
export function dayToWire(day: string): string {
  return `${day}T00:00:00Z`;
}

/** An instant a few days back, at a fixed hour, so seeded timestamps never depend on the time of the visit. */
export function instantOn(day: string, hour = 12): string {
  return `${day}T${String(hour).padStart(2, "0")}:00:00Z`;
}
