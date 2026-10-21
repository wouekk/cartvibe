import { TestBed } from "@angular/core/testing";
import { storedMode, THEME_MODE_STORAGE_KEY, THEME_SCHEME_STORAGE_KEY, ThemeService } from "./theme.service";
import { findTheme, THEMES } from "./themes";

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
  });

  afterEach(() => window.localStorage.clear());

  it("starts on System", () => {
    expect(create().mode()).toBe("system");
  });

  it("applies a theme by key: the data-theme attribute, the dark class for a dark scheme, and remembers both", () => {
    const service = create();

    service.setMode("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(THEME_SCHEME_STORAGE_KEY)).toBe("dark");

    service.setMode("light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_SCHEME_STORAGE_KEY)).toBe("light");
    expect(storedMode()).toBe("light");
  });

  it("reads a stored theme on creation and treats an unknown stored value as System", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "dark");
    expect(create().mode()).toBe("dark");

    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "sepia");
    expect(create().mode()).toBe("system");
  });

  it("refuses a theme that is not registered", () => {
    const service = create();

    service.setMode("sepia");

    expect(service.mode()).toBe("system");
  });

  it("still works when storage is blocked", () => {
    const service = create();
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => service.setMode("dark")).not.toThrow();
    expect(root.classList.contains("dark")).toBe(true);

    setItem.mockRestore();
  });

  it("has a registered, unique key for every theme", () => {
    const keys = THEMES.map((theme) => theme.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(findTheme("light")?.scheme).toBe("light");
    expect(findTheme("dark")?.scheme).toBe("dark");
  });
});
