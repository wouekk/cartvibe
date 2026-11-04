import { DEMO_STORAGE_PREFIX, clearDemoStorage, installDemoStorage } from "./demo-storage";

describe("demo storage", () => {
  beforeAll(() => {
    // Another site of the same origin, written before the demo starts.
    window.localStorage.setItem("someone-elses-key", "keep me");
    installDemoStorage();
  });

  afterEach(() => {
    clearDemoStorage(window.localStorage, []);
  });

  it("keeps every key the app writes under the demo prefix", () => {
    window.localStorage.setItem("cartvibe.themeMode", "dark");
    window.sessionStorage.setItem("anything", "1");

    expect(window.localStorage.getItem("cartvibe.themeMode")).toBe("dark");
    const stored = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
    expect(stored).toContain(`${DEMO_STORAGE_PREFIX}cartvibe.themeMode`);
    expect(stored).not.toContain("cartvibe.themeMode");
    expect(window.sessionStorage.key(0)).toBe(`${DEMO_STORAGE_PREFIX}anything`);
  });

  it("does not see, and never clears, keys of other sites on the origin", () => {
    window.localStorage.setItem("auth", "demo");

    expect(window.localStorage.getItem("someone-elses-key")).toBeNull();

    window.localStorage.clear();

    expect(window.localStorage.getItem("auth")).toBeNull();
    const stored = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
    expect(stored).toContain("someone-elses-key");
  });

  it("removes through the prefix", () => {
    window.localStorage.setItem("language", "pl");
    window.localStorage.removeItem("language");

    expect(window.localStorage.getItem("language")).toBeNull();
  });

  it("a reset keeps the look but forgets the rest of the demo's keys", () => {
    window.localStorage.setItem("cartvibe.themeMode", "dark");
    window.localStorage.setItem("cartvibe.themePalette", "blue");
    window.localStorage.setItem("receiptTable", "{}");

    clearDemoStorage(window.localStorage);

    expect(window.localStorage.getItem("cartvibe.themeMode")).toBe("dark");
    expect(window.localStorage.getItem("cartvibe.themePalette")).toBe("blue");
    expect(window.localStorage.getItem("receiptTable")).toBeNull();
  });
});
