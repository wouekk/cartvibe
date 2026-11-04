import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { DemoSession, demoToday } from "./demo-session";
import { DEMO_STORAGE_PREFIX, installDemoStorage } from "./demo-storage";

describe("DemoSession", () => {
  beforeEach(() => {
    installDemoStorage();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it("builds the sample data around the UTC day of the visit", () => {
    expect(demoToday(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    expect(demoToday(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11-01");
  });

  it("resets the household, forgets saved screens except the look, and reloads at the start", () => {
    const session = TestBed.inject(DemoSession);
    const restart = vi.spyOn(session, "restart").mockImplementation(() => undefined);
    const resetBackend = vi.spyOn(session.backend, "reset");
    window.localStorage.setItem("receiptTable", "{}");
    window.localStorage.setItem("cartvibe.themeMode", "dark");

    session.reset();

    expect(resetBackend).toHaveBeenCalled();
    expect(window.localStorage.getItem("receiptTable")).toBeNull();
    expect(window.localStorage.getItem("cartvibe.themeMode")).toBe("dark");
    expect(restart).toHaveBeenCalledTimes(1);
    expect(DEMO_STORAGE_PREFIX).toBe("cartvibe-demo:");
  });
});
