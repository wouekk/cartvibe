import { monthSummary, sentenceParts } from "./overview-summary";

describe("sentenceParts", () => {
  it("splits a sentence at its marks and keeps the spaces between them", () => {
    expect(sentenceParts("<b>92 € spent this month:</b> <mark>12 € over the goal</mark> of 80 €.")).toEqual([
      { text: "92 € spent this month:", style: "lead" },
      { text: " ", style: "plain" },
      { text: "12 € over the goal", style: "verdict" },
      { text: " of 80 €.", style: "plain" },
    ]);
  });

  it("takes the marks wherever a language puts them", () => {
    expect(sentenceParts("Ce mois-ci, <mark>12 € de trop</mark> : <b>92 € dépensés</b>").map((part) => part.style)).toEqual([
      "plain",
      "verdict",
      "plain",
      "lead",
    ]);
  });

  it("gives a sentence without marks back as one plain part, and an empty one as nothing", () => {
    expect(sentenceParts("92 € spent this month.")).toEqual([{ text: "92 € spent this month.", style: "plain" }]);
    expect(sentenceParts("")).toEqual([]);
  });

  it("shows a mark that was left open as it was typed, never hides words", () => {
    const parts = sentenceParts("<b>92 € spent: <mark>12 € over</mark> of 80 €.");

    expect(parts.map((part) => part.text).join("")).toBe("<b>92 € spent: 12 € over of 80 €.");
    expect(parts.find((part) => part.style === "verdict")?.text).toBe("12 € over");
  });

  it("drops an empty mark", () => {
    expect(sentenceParts("<b></b>92 €")).toEqual([{ text: "92 €", style: "plain" }]);
  });
});

describe("monthSummary", () => {
  const november = ["2026-11-01", "2026-11-30"] as const;

  it("says what is left of the goal and what a day may cost for the rest of the month", () => {
    expect(monthSummary(820, 1500, ...november, "2026-11-11")).toEqual({
      spent: 820,
      goal: 1500,
      // The 11th to the 30th, today included.
      daysLeft: 20,
      remaining: 680,
      over: 0,
      perDay: 34,
    });
  });

  it("counts the last day of the month as one day left", () => {
    const summary = monthSummary(1400, 1500, ...november, "2026-11-30");

    expect(summary?.daysLeft).toBe(1);
    expect(summary?.perDay).toBe(100);
  });

  it("counts the whole month on its first day, in a month of any length", () => {
    expect(monthSummary(0, 300, "2026-02-01", "2026-02-28", "2026-02-01")?.daysLeft).toBe(28);
    expect(monthSummary(0, 300, "2028-02-01", "2028-02-29", "2028-02-01")?.daysLeft).toBe(29);
    expect(monthSummary(0, 310, "2026-12-01", "2026-12-31", "2026-12-01")).toEqual(
      expect.objectContaining({ daysLeft: 31, perDay: 10 })
    );
  });

  it("rounds the daily amount down to the cent, so spending it every day never passes the goal", () => {
    // 100.00 over 3 days is 33.333…: 33.33 a day ends at 99.99.
    const summary = monthSummary(0, 100, ...november, "2026-11-28");

    expect(summary?.perDay).toBe(33.33);
    expect(summary!.perDay * summary!.daysLeft).toBeLessThanOrEqual(100);
  });

  it("reports what is over the goal, with nothing left to spend a day", () => {
    expect(monthSummary(1620.5, 1500, ...november, "2026-11-20")).toEqual(
      expect.objectContaining({ over: 120.5, remaining: 0, perDay: 0, daysLeft: 11 })
    );
  });

  it("treats a goal met to the cent as reached, whatever floating point makes of the sum", () => {
    // 0.1 + 0.2 is 0.30000000000000004.
    expect(monthSummary(0.1 + 0.2, 0.3, ...november, "2026-11-11")).toEqual(
      expect.objectContaining({ over: 0, remaining: 0, perDay: 0 })
    );
  });

  it("has nothing to say without a goal", () => {
    expect(monthSummary(820, 0, ...november, "2026-11-11")).toBeUndefined();
    expect(monthSummary(820, Number.NaN, ...november, "2026-11-11")).toBeUndefined();
  });

  it("has nothing to say for a month that is over or has not begun", () => {
    expect(monthSummary(820, 1500, "2026-10-01", "2026-10-31", "2026-11-11")).toBeUndefined();
    expect(monthSummary(0, 1500, "2026-12-01", "2026-12-31", "2026-11-11")).toBeUndefined();
  });

  it("has nothing to say for a range that is not one whole calendar month", () => {
    expect(monthSummary(820, 1500, "2026-11-05", "2026-11-11", "2026-11-11")).toBeUndefined();
    expect(monthSummary(820, 1500, "2026-01-01", "2026-12-31", "2026-11-11")).toBeUndefined();
    expect(monthSummary(820, 1500, undefined, undefined, "2026-11-11")).toBeUndefined();
  });

  it("has nothing to say while the total is not a number yet", () => {
    expect(monthSummary(Number.NaN, 1500, ...november, "2026-11-11")).toBeUndefined();
  });
});
