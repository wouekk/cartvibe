import {
  buildMonthlyCsv,
  buildPrintHtml,
  exceedsOneYear,
  monthKeysBetween,
  monthsSpanned,
  splitIntoYears,
} from "./overview-export";

describe("overview export", () => {
  it("counts the months a range touches", () => {
    expect(monthsSpanned("2026-01-01", "2026-12-31")).toBe(12);
    expect(monthsSpanned("2025-10-21", "2026-10-20")).toBe(13);
  });

  it("only exports a range that is really longer than a year", () => {
    expect(exceedsOneYear("2026-01-01", "2026-12-31")).toBe(false);
    expect(exceedsOneYear("2025-10-21", "2026-10-20")).toBe(false);
    expect(exceedsOneYear("2025-01-01", "2026-03-01")).toBe(true);
  });

  it("splits a range at calendar years, keeping its own first and last day", () => {
    expect(splitIntoYears("2024-03-10", "2026-02-01")).toEqual([
      { label: "2024", from: "2024-03-10", to: "2024-12-31" },
      { label: "2025", from: "2025-01-01", to: "2025-12-31" },
      { label: "2026", from: "2026-01-01", to: "2026-02-01" },
    ]);
  });

  it("lists every month, including empty ones", () => {
    expect(monthKeysBetween("2025-11-15", "2026-02-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("writes the CSV with the difference to the goal, or without a goal", () => {
    const rows = [
      { month: "2026-09", total: 1620 },
      { month: "2026-10", total: 78.44 },
    ];

    expect(buildMonthlyCsv(rows, 1500)).toBe(
      "Month,Total Spent,Goal,Difference\r\n2026-09,1620.00,1500.00,120.00\r\n2026-10,78.44,1500.00,-1421.56\r\n"
    );
    expect(buildMonthlyCsv(rows, 0)).toBe("Month,Total Spent,Goal,Difference\r\n2026-09,1620.00,,\r\n2026-10,78.44,,\r\n");
  });

  it("builds one landscape page per year, escaping what it prints", () => {
    const month = (name: string, total: number) => ({ name, total, text: String(total) });
    const html = buildPrintHtml("Spending <report>", "2025 – 2026", [
      { label: "2025", total: "10", months: [month("Jan", 10)], categories: [{ name: "Fish & Chips", total: "10" }] },
      { label: "2026", total: "0", months: [month("Jan", 0)], categories: [] },
    ]);

    expect(html).toContain("size: A4 landscape");
    expect(html.match(/<section class="page">/g)?.length).toBe(2);
    expect(html).toContain("Spending &lt;report&gt;");
    expect(html).toContain("Fish &amp; Chips");
    expect(html).toContain("No spending this year.");
    expect(html).toContain("break-after: page");
  });
});
