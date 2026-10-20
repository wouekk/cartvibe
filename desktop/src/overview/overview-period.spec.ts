import { formatDay, previousLabel, resolvePeriod } from "./overview-period";

describe("resolvePeriod", () => {
  const today = new Date(2026, 9, 20); // Tuesday 20 Oct 2026

  it("gives the calendar month for this and last month", () => {
    expect(resolvePeriod("THIS_MONTH", today)).toEqual({ from: "2026-10-01", to: "2026-10-31", label: "October 2026" });
    expect(resolvePeriod("LAST_MONTH", today)).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "September 2026" });
  });

  it("rolls last month back over New Year", () => {
    expect(resolvePeriod("LAST_MONTH", new Date(2026, 0, 15))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
      label: "December 2025",
    });
  });

  it("gives the monday-to-sunday week before the current one", () => {
    expect(resolvePeriod("LAST_WEEK", today)?.from).toBe("2026-10-12");
    expect(resolvePeriod("LAST_WEEK", today)?.to).toBe("2026-10-18");
    // On a Sunday the current week began six days ago, so last week is the one before that.
    expect(resolvePeriod("LAST_WEEK", new Date(2026, 9, 18))).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    expect(resolvePeriod("LAST_WEEK", new Date(2026, 9, 19))).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("gives whole years", () => {
    expect(resolvePeriod("THIS_YEAR", today)).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
    expect(resolvePeriod("LAST_YEAR", today)).toEqual({ from: "2025-01-01", to: "2025-12-31", label: "2025" });
  });

  it("waits for a usable custom range", () => {
    expect(resolvePeriod("CUSTOM", today)).toBeUndefined();
    expect(resolvePeriod("CUSTOM", today, { from: "2026-10-10", to: "" })).toBeUndefined();
    expect(resolvePeriod("CUSTOM", today, { from: "2026-10-10", to: "2026-10-01" })).toBeUndefined();
    expect(resolvePeriod("CUSTOM", today, { from: "2026-10-01", to: "2026-10-10" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
      label: "1 Oct 2026 – 10 Oct 2026",
    });
  });
});

describe("previousLabel", () => {
  it("names a whole month, a whole year, or the days", () => {
    expect(previousLabel("2026-09-01", "2026-09-30")).toBe("September 2026");
    expect(previousLabel("2025-01-01", "2025-12-31")).toBe("2025");
    expect(previousLabel("2026-10-05", "2026-10-11")).toBe("5 Oct 2026 – 11 Oct 2026");
  });

  it("formats a day", () => {
    expect(formatDay("2026-03-04")).toBe("4 Mar 2026");
  });
});
