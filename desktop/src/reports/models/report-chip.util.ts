/**
 * Shared presentation for group/scope avatar chips in the Report Builder (the
 * add-group dialog and the config panel's scope chips). Kept in one place so the
 * palette and initials stay in sync across both.
 */

/** Rotating avatar backgrounds, indexed by chip position modulo its length: the chart tokens, so both themes fit. */
export const CHIP_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** The 1-2 character avatar initials for a group name (falls back to "?"). */
export function groupInitials(name: string | undefined): string {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}
