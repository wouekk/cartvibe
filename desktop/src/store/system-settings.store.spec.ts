import { TestBed } from "@angular/core/testing";
import { seedStore } from "../testing/seed-store";
import { SystemSettingsStore } from "./system-settings.store";

describe("SystemSettingsStore time zone", () => {
  let settings: SystemSettingsStore;

  beforeEach(() => {
    settings = TestBed.inject(SystemSettingsStore);
  });

  it("defaults to UTC", () => {
    expect(settings.timeZone()).toBe("UTC");
  });

  it("is set from AppData", () => {
    settings.setTimeZone("America/New_York");

    expect(settings.timeZone()).toBe("America/New_York");
  });

  it("treats an empty value as UTC", () => {
    settings.setTimeZone("");

    expect(settings.timeZone()).toBe("UTC");
  });

  // What was kept is laid over the defaults (state-store.spec.ts); a slice that names the key without a value
  // must still read as UTC.
  it("falls back to UTC for a kept slice without a zone", () => {
    seedStore(settings, { currencyDisplay: "$", timeZone: undefined });

    expect(settings.timeZone()).toBe("UTC");
  });

  it("reads an unknown date format as the default one", () => {
    seedStore(settings, { dateFormat: "not a format" as any });

    expect(settings.dateFormat()).toBe(settings.dateFormat());
    settings.setDateFormat("also not a format");
    expect(settings.state().dateFormat).toBe(settings.dateFormat());
  });
});
