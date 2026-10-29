import {
  addCalendarMonths,
  addWarrantyYears,
  automaticWarrantyYears,
  browserRegion,
  daysBetween,
  effectiveRegion,
  regionFromLocale,
  warrantyRows,
  warrantyYears,
} from "./warranty-period";

describe("warranty period", () => {
  it("is 2 years in the EU and its outermost regions, 1 year elsewhere", () => {
    for (const region of ["PL", "de", "SE", "GP", "IC", "EA", "RE"]) {
      expect(automaticWarrantyYears(region)).toBe(2);
    }
    for (const region of ["US", "GB", "CH", "NO", "", null, undefined]) {
      expect(automaticWarrantyYears(region)).toBe(1);
    }
  });

  it("reads the region from a browser locale", () => {
    expect(regionFromLocale("pl-PL")).toBe("PL");
    expect(regionFromLocale("en_us")).toBe("US");
    expect(regionFromLocale("zh-Hant-TW")).toBe("TW");
    expect(regionFromLocale("de")).toBe("");
    expect(browserRegion(["de", "fr-FR", "en-US"])).toBe("FR");
    expect(browserRegion([])).toBe("");
  });

  it("prefers the chosen region over the browser's", () => {
    expect(effectiveRegion("us", ["pl-PL"])).toBe("US");
    expect(effectiveRegion("", ["pl-PL"])).toBe("PL");
  });

  it("uses a chosen period, or Automatic by region", () => {
    expect(warrantyYears(5, "US")).toBe(5);
    expect(warrantyYears(null, "PL")).toBe(2);
    expect(warrantyYears(4, "US")).toBe(1);
  });

  it("adds whole years by the calendar", () => {
    const iso = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    expect(iso(addWarrantyYears(new Date(2026, 9, 29), 2))).toBe("2028-10-29");
    expect(iso(addWarrantyYears(new Date(2024, 1, 29), 1))).toBe("2025-02-28");
    expect(iso(addWarrantyYears(new Date(2024, 1, 29), 4))).toBe("2028-02-29");
    expect(iso(addCalendarMonths(new Date(2026, 11, 31), 2))).toBe("2027-02-28");
    expect(iso(addCalendarMonths(new Date(2026, 9, 29), 2))).toBe("2026-12-29");
  });

  it("makes a row per product, the shop and dates on the receipt's first row", () => {
    const rows = warrantyRows(
      [
        { id: 1, name: "Apple", shopName: "Apple", date: "2026-10-07T00:00:00Z", warrantyUntil: "2026-11-08", warrantyProducts: ["Apple MacBook", "Apple MacBook cable"] },
        { id: 2, name: "Lamp", date: "2026-01-02T00:00:00Z", warrantyUntil: "2026-12-01" },
      ],
      "2026-10-29"
    );
    expect(rows.map((row) => [row.receiptId, row.shop, row.product, row.daysLeft, row.first])).toEqual([
      [1, "Apple", "Apple MacBook", 10, true],
      [1, "Apple", "Apple MacBook cable", 10, false],
      [2, "Lamp", "", 33, true],
    ]);
  });

  it("counts the days left", () => {
    expect(daysBetween("2026-10-29", "2026-10-29")).toBe(0);
    expect(daysBetween("2026-10-29", "2026-12-29")).toBe(61);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-29", "")).toBeNull();
  });
});
