import {
  buildDonutSegments,
  buildMonthBars,
  buildTrendBars,
  describeChangeAgainst,
  goalLineFraction,
  parseGoalInput,
  parseInlineGoalInput,
  describeChange,
  formatMonthLabel,
  monthDayRange,
  previousMonthOf,
  toMonthKey,
} from "./overview-chart.utils";

describe("overview chart utils", () => {
  it("formats months for the API and for people", () => {
    expect(toMonthKey({ year: 2026, month: 9 })).toBe("2026-10");
    expect(toMonthKey({ year: 2026, month: 0 })).toBe("2026-01");
    expect(formatMonthLabel({ year: 2026, month: 9 })).toBe("October 2026");
  });

  it("spans a month as calendar days, leap years included", () => {
    expect(monthDayRange({ year: 2026, month: 9 })).toEqual(["2026-10-01", "2026-10-31"]);
    expect(monthDayRange({ year: 2028, month: 1 })).toEqual(["2028-02-01", "2028-02-29"]);
    expect(monthDayRange({ year: 2026, month: 1 })).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("steps back across a year boundary", () => {
    expect(previousMonthOf({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 });
    expect(previousMonthOf({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 8 });
  });

  describe("buildDonutSegments", () => {
    it("shares the ring by amount and lays slices end to end", () => {
      const segments = buildDonutSegments([
        { name: "Groceries", total: "75" },
        { name: "Dining out", total: "25" },
      ]);

      expect(segments.map((segment) => [segment.name, segment.share])).toEqual([
        ["Groceries", "75%"],
        ["Dining out", "25%"],
      ]);
      expect(segments[0].dashOffset).toBeCloseTo(0);
      expect(segments[1].dashOffset).toBeCloseTo(-(0.75 * 2 * Math.PI * 70));
    });

    it("folds categories beyond five into Other and drops empty ones", () => {
      const segments = buildDonutSegments([
        { name: "A", total: "60" },
        { name: "B", total: "50" },
        { name: "C", total: "40" },
        { name: "D", total: "30" },
        { name: "E", total: "20" },
        { name: "F", total: "6" },
        { name: "G", total: "4" },
        { name: "Zero", total: "0" },
      ]);

      expect(segments.map((segment) => segment.name)).toEqual(["A", "B", "C", "D", "E", "Other"]);
      expect(segments[5].total).toBe(10);
    });

    it("draws nothing for a month without spending", () => {
      expect(buildDonutSegments([])).toEqual([]);
      expect(buildDonutSegments([{ name: "A", total: "0" }])).toEqual([]);
    });
  });

  it("scales bars to the tallest month and marks the selected one", () => {
    const bars = buildMonthBars(
      [
        { month: "2026-09", total: "200" },
        { month: "2026-10", total: "100" },
        { month: "2026-11", total: "0" },
      ],
      "2026-10"
    );

    expect(bars.map((bar) => [bar.shortName, bar.heightPercent, bar.isSelected])).toEqual([
      ["Sep", 100, false],
      ["Oct", 50, true],
      ["Nov", 0, false],
    ]);
  });

  it("describes the month-over-month change, or nothing without a previous month", () => {
    const september = { year: 2026, month: 8 };
    expect(describeChange("92", "100", september)).toBe("8% less than September");
    expect(describeChange("150", "100", september)).toBe("50% more than September");
    expect(describeChange("100.2", "100", september)).toBe("About the same as September");
    expect(describeChange("100", "0", september)).toBeUndefined();
  });
});

describe("buildTrendBars", () => {
  it("highlights the months inside the period and names them by month", () => {
    const bars = buildTrendBars(
      [
        { month: "2026-08", total: "10" },
        { month: "2026-09", total: "20" },
        { month: "2026-10", total: "0" },
      ],
      "MONTH",
      "2026-09-01",
      "2026-10-31"
    );

    expect(bars.map((bar) => bar.shortName)).toEqual(["Aug", "Sep", "Oct"]);
    expect(bars.map((bar) => bar.isSelected)).toEqual([false, true, true]);
    expect(bars[1].heightPercent).toBe(100);
    expect(bars[2].heightPercent).toBe(0);
  });

  it("names a day trend by day of month and highlights every day", () => {
    const bars = buildTrendBars(
      [
        { month: "2026-10-12", total: "5" },
        { month: "2026-10-13", total: "0" },
      ],
      "DAY",
      "2026-10-12",
      "2026-10-18"
    );

    expect(bars.map((bar) => bar.shortName)).toEqual(["12", "13"]);
    expect(bars.every((bar) => bar.isSelected)).toBe(true);
  });
});

describe("describeChangeAgainst", () => {
  it("words the change against any period name", () => {
    expect(describeChangeAgainst("92", "100", "last week")).toBe("8% less than last week");
    expect(describeChangeAgainst("150", "100", "2025")).toBe("50% more than 2025");
    expect(describeChangeAgainst("100", "100", "May")).toBe("About the same as May");
    expect(describeChangeAgainst("100", "0", "May")).toBeUndefined();
  });
});

describe("buildTrendBars with a spending goal", () => {
  const trend = [
    { month: "2026-08", total: "100" },
    { month: "2026-09", total: "500" },
    { month: "2026-10", total: "528.44" },
  ];

  it("scales to the tallest month and splits a month over the goal", () => {
    const bars = buildTrendBars(trend, "MONTH", "2026-10-01", "2026-10-31", 500);

    expect(bars[0]).toMatchObject({ baseAmount: 100, overAmount: 0 });
    expect(bars[1]).toMatchObject({ baseAmount: 500, overAmount: 0 });
    expect(bars[2].baseAmount).toBe(500);
    expect(bars[2].overAmount).toBeCloseTo(28.44, 2);
    expect(bars[2].fraction).toBe(1);
    expect(bars[0].fraction).toBeCloseTo(100 / 528.44, 5);
  });

  it("does not squash small months under a goal far above them", () => {
    const bars = buildTrendBars([{ month: "2026-10", total: "78.44" }], "MONTH", "2026-10-01", "2026-10-31", 1500);

    expect(bars[0].fraction).toBe(1);
    expect(bars[0].overAmount).toBe(0);
  });

  it("changes nothing without a goal, or on a day trend", () => {
    expect(buildTrendBars(trend, "MONTH", "2026-10-01", "2026-10-31")[2].overAmount).toBeUndefined();
    expect(buildTrendBars([{ month: "2026-10-01", total: "5" }], "DAY", "2026-10-01", "2026-10-07", 500)[0].fraction).toBeUndefined();
  });
});

describe("goalLineFraction", () => {
  it("is the goal's height on the tallest month's scale, 0 without a goal or spending", () => {
    expect(goalLineFraction([100, 1000], 500)).toBe(0.5);
    expect(goalLineFraction([100, 250], 500)).toBe(2);
    expect(goalLineFraction([100], 0)).toBe(0);
    expect(goalLineFraction([0, 0], 500)).toBe(0);
  });
});

describe("parseGoalInput", () => {
  it("clears on empty, accepts a comma, and refuses the rest", () => {
    expect(parseGoalInput("  ")).toEqual({ ok: true });
    expect(parseGoalInput("500,50")).toEqual({ ok: true, value: "500.50" });
    for (const bad of ["abc", "0", "-5", "1.234", "€5"]) {
      expect(parseGoalInput(bad).ok).toBe(false);
    }
  });
});

describe("parseInlineGoalInput", () => {
  it("clears on empty or zero, otherwise follows the goal rules", () => {
    for (const clear of ["", "  ", "0", "0,00", "0.0", "00"]) {
      expect(parseInlineGoalInput(clear)).toEqual({ ok: true });
    }
    expect(parseInlineGoalInput("1500")).toEqual({ ok: true, value: "1500" });
    expect(parseInlineGoalInput("1500,5")).toEqual({ ok: true, value: "1500.5" });
    expect(parseInlineGoalInput("abc").ok).toBe(false);
    expect(parseInlineGoalInput("-5").ok).toBe(false);
  });
});
