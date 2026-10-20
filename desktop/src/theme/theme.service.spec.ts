import { TestBed } from "@angular/core/testing";
import { ACCENT_STORAGE_KEY, storedAccent, storedMode, THEME_MODE_STORAGE_KEY, ThemeService } from "./theme.service";

describe("ThemeService", () => {
  const root = document.documentElement;

  const create = (): ThemeService => {
    TestBed.resetTestingModule();
    return TestBed.inject(ThemeService);
  };

  beforeEach(() => {
    window.localStorage.clear();
    root.className = "";
    root.removeAttribute("data-theme");
    root.removeAttribute("data-accent");
  });

  afterEach(() => window.localStorage.clear());

  it("starts on System and the Classic Blue accent", () => {
    const service = create();

    expect(service.mode()).toBe("system");
    expect(service.accent()).toBe("classic");
    expect(root.getAttribute("data-accent")).toBe("classic");
  });

  it("turns dark on and off for Dark and Light, and remembers the choice", () => {
    const service = create();

    service.setMode("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");

    service.setMode("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(storedMode()).toBe("light");
  });

  it("applies and remembers an accent", () => {
    const service = create();

    service.setAccent("brown");

    expect(root.getAttribute("data-accent")).toBe("brown");
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("brown");
    expect(service.accent()).toBe("brown");
  });

  it("reads what an earlier build stored, and ignores what it does not know", () => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "indigo");
    expect(storedAccent()).toBe("violet");

    window.localStorage.setItem(ACCENT_STORAGE_KEY, "pink");
    expect(storedAccent()).toBe("classic");

    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "sepia");
    expect(storedMode()).toBe("system");
  });
});
