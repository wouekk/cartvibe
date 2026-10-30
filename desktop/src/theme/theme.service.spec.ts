import { TestBed } from "@angular/core/testing";
import { storedMode, storedPalette, THEME_MODE_STORAGE_KEY, THEME_PALETTE_STORAGE_KEY, ThemeService } from "./theme.service";
import { DEFAULT_PALETTE, findPalette, MODE_OPTIONS, PALETTES } from "./themes";

describe("ThemeService", () => {
  const root = document.documentElement;
  const originalMatchMedia = window.matchMedia;

  /** A matchMedia whose "prefers dark" answer can be flipped, with the change event the browser would fire. */
  const mockSystem = (initiallyDark: boolean) => {
    const listeners: (() => void)[] = [];
    const query = {
      matches: initiallyDark,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
    };
    window.matchMedia = vi.fn().mockReturnValue(query) as unknown as typeof window.matchMedia;
    return {
      switchTo: (dark: boolean) => {
        query.matches = dark;
        listeners.forEach((listener) => listener());
      },
    };
  };

  const create = (): ThemeService => {
    TestBed.resetTestingModule();
    return TestBed.inject(ThemeService);
  };

  beforeEach(() => {
    window.localStorage.clear();
    root.className = "";
    root.removeAttribute("data-palette");
    window.matchMedia = originalMatchMedia;
  });

  afterEach(() => {
    window.localStorage.clear();
    window.matchMedia = originalMatchMedia;
  });

  it("starts on System with the default palette", () => {
    const service = create();

    expect(service.mode()).toBe("system");
    expect(service.palette()).toBe(DEFAULT_PALETTE);
    expect(root.getAttribute("data-palette")).toBe("zinc");
  });

  it("applies a mode: the dark class at night, and remembers it", () => {
    const service = create();

    service.setMode("dark");
    expect(root.classList.contains("dark")).toBe(true);
    expect(service.isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");

    service.setMode("light");
    expect(root.classList.contains("dark")).toBe(false);
    expect(service.isDark()).toBe(false);
    expect(storedMode()).toBe("light");
  });

  it("applies a palette: the data-palette attribute, whatever the mode, and remembers it", () => {
    const service = create();

    service.setPalette("indigo");
    expect(root.getAttribute("data-palette")).toBe("indigo");
    expect(window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY)).toBe("indigo");
    expect(storedPalette()).toBe("indigo");

    service.setMode("dark");
    expect(root.getAttribute("data-palette")).toBe("indigo");
    expect(root.classList.contains("dark")).toBe(true);

    service.setPalette("violet");
    expect(root.getAttribute("data-palette")).toBe("violet");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("reads the stored mode and palette on creation", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "dark");
    window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, "emerald");

    const service = create();

    expect(service.mode()).toBe("dark");
    expect(service.palette()).toBe("emerald");
    expect(root.getAttribute("data-palette")).toBe("emerald");
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("keeps working for a browser that stored only the mode, from before palettes", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "light");
    window.localStorage.setItem("rw_theme_scheme", "light");

    const service = create();

    expect(service.mode()).toBe("light");
    expect(service.palette()).toBe("zinc");
  });

  it("treats an unknown stored mode as System and an unknown stored palette as the default", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "sepia");
    window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, "pink");

    const service = create();

    expect(service.mode()).toBe("system");
    expect(service.palette()).toBe(DEFAULT_PALETTE);
    expect(root.getAttribute("data-palette")).toBe(DEFAULT_PALETTE);
  });

  it("refuses a mode or a palette that is not registered", () => {
    const service = create();

    service.setMode("sepia" as never);
    service.setPalette("pink");

    expect(service.mode()).toBe("system");
    expect(service.palette()).toBe(DEFAULT_PALETTE);
  });

  it("follows the operating system on System, including when it switches", () => {
    const system = mockSystem(false);
    const service = create();

    expect(service.isDark()).toBe(false);
    expect(root.classList.contains("dark")).toBe(false);

    system.switchTo(true);
    expect(service.isDark()).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);

    service.setMode("light");
    system.switchTo(true);
    expect(service.isDark()).toBe(false);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("starts at night when the system is dark and the mode is System", () => {
    mockSystem(true);

    const service = create();

    expect(service.isDark()).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("still works when storage is blocked", () => {
    const service = create();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => service.setMode("dark")).not.toThrow();
    expect(() => service.setPalette("blue")).not.toThrow();
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.getAttribute("data-palette")).toBe("blue");

    setItem.mockRestore();
  });

  it("has a unique key for every palette and mode, and the five palettes asked for", () => {
    const keys = PALETTES.map((palette) => palette.key);
    const modes = MODE_OPTIONS.map((option) => option.mode);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["blue", "zinc", "indigo", "emerald", "violet"]);
    expect(findPalette(DEFAULT_PALETTE)).toBeDefined();
    expect(modes).toEqual(["system", "light", "dark"]);
  });
});
