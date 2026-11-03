import { formatAppDate } from "../pipes/app-date.pipe";
import { APP_DATE_FORMATS, appDatePattern, DEFAULT_APP_DATE_FORMAT, resolveAppDateFormat } from "./app-date-format";

describe("app date format", () => {
  it("resolves an empty or unknown format to the default", () => {
    expect(DEFAULT_APP_DATE_FORMAT).toBe("DD/MM/YYYY");
    expect(resolveAppDateFormat(undefined)).toBe("DD/MM/YYYY");
    expect(resolveAppDateFormat("")).toBe("DD/MM/YYYY");
    expect(resolveAppDateFormat("dd-MM-yy")).toBe("DD/MM/YYYY");
    for (const format of APP_DATE_FORMATS) {
      expect(resolveAppDateFormat(format)).toBe(format);
    }
  });

  it("shows a calendar day in every format", () => {
    const day = "2026-11-03T00:00:00Z";
    const shown = APP_DATE_FORMATS.map((format) => formatAppDate(day, "mediumDate", "calendar", "UTC", "en-US", format));

    expect(shown).toEqual(["03/11/2026", "11/03/2026", "2026/11/03", "03.11.2026", "2026-11-03"]);
  });

  it("rewrites whole dates, day-month and date-times, and leaves the rest", () => {
    expect(appDatePattern("MMM d, y", "DD.MM.YYYY", "en-US")).toBe("dd.MM.yyyy");
    expect(appDatePattern("MMM d", "DD/MM/YYYY", "en-US")).toBe("dd/MM");
    expect(appDatePattern("MMM d", "YYYY-MM-DD", "en-US")).toBe("MM-dd");
    expect(appDatePattern("MMM", "MM/DD/YYYY", "en-US")).toBe("MMM");
    expect(appDatePattern("d", "MM/DD/YYYY", "en-US")).toBe("d");
  });

  it("keeps the language's time after the date", () => {
    const instant = "2026-11-03T14:05:00Z";

    // \s: English puts a narrow no-break space before AM/PM.
    expect(formatAppDate(instant, "short", "instant", "UTC", "en-US", "DD/MM/YYYY")).toMatch(/^03\/11\/2026 2:05\sPM$/);
    expect(formatAppDate(instant, "medium", "instant", "Europe/Warsaw", "en-US", "YYYY-MM-DD")).toMatch(/^2026-11-03 3:05:00\sPM$/);
  });

  it("leaves the format alone when no household format is given", () => {
    expect(formatAppDate("2026-11-03T00:00:00Z", "mediumDate", "calendar", "UTC", "en-US")).toBe("Nov 3, 2026");
  });
});
