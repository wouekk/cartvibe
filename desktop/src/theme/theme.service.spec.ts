import { TestBed } from "@angular/core/testing";
import {
  INTERFACE_SIZE_STORAGE_KEY,
  storedInterfaceSize,
  storedMode,
  storedPalette,
  THEME_MODE_STORAGE_KEY,
  THEME_PALETTE_STORAGE_KEY,
  ThemeService,
} from "./theme.service";
import { DEFAULT_PALETTE, findPalette, INTERFACE_SIZES, interfaceSizeForScreen, MODE_OPTIONS, PALETTES } from "./themes";

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

  it("moves a look stored under the old upstream keys to the new ones", () => {
    window.localStorage.setItem("rw_theme_mode", "dark");
    window.localStorage.setItem("rw_theme_palette", "violet");

    const service = create();

    expect(service.mode()).toBe("dark");
    expect(service.palette()).toBe("violet");
    expect(window.localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY)).toBe("violet");
    expect(window.localStorage.getItem("rw_theme_mode")).toBeNull();
    expect(window.localStorage.getItem("rw_theme_palette")).toBeNull();
  });

  it("keeps working for a browser that stored only the mode, from before palettes", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "light");

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

  describe("interface size", () => {
    const originalScreen = Object.getOwnPropertyDescriptor(window, "screen");

    const screenWidth = (width: number) =>
      Object.defineProperty(window, "screen", { configurable: true, value: { width } });

    beforeEach(() => {
      root.style.fontSize = "";
      screenWidth(1440);
    });

    afterEach(() => {
      root.style.fontSize = "";
      if (originalScreen) {
        Object.defineProperty(window, "screen", originalScreen);
      }
    });

    it("starts at Standard and leaves the browser's own font size alone", () => {
      const service = create();

      expect(service.interfaceSize()).toBe("100");
      expect(root.style.fontSize).toBe("");
      expect(window.localStorage.getItem(INTERFACE_SIZE_STORAGE_KEY)).toBeNull();
    });

    it("applies a size as a percentage on the root and remembers it", () => {
      const service = create();

      service.setInterfaceSize("150");
      expect(root.style.fontSize).toBe("150%");
      expect(window.localStorage.getItem(INTERFACE_SIZE_STORAGE_KEY)).toBe("150");

      service.setInterfaceSize("100");
      expect(root.style.fontSize).toBe("");
      expect(storedInterfaceSize()).toBe("100");
    });

    it("reads the stored size on creation, and treats an unknown one as Standard", () => {
      window.localStorage.setItem(INTERFACE_SIZE_STORAGE_KEY, "125");
      expect(create().interfaceSize()).toBe("125");
      expect(root.style.fontSize).toBe("125%");

      window.localStorage.setItem(INTERFACE_SIZE_STORAGE_KEY, "9000");
      expect(create().interfaceSize()).toBe("100");
      expect(root.style.fontSize).toBe("");

      create().setInterfaceSize("huge");
      expect(storedInterfaceSize()).toBe("100");
    });

    it("gives a wide screen that never chose the size it had under the old width rule, once", () => {
      screenWidth(3840);

      expect(create().interfaceSize()).toBe("200");
      expect(window.localStorage.getItem(INTERFACE_SIZE_STORAGE_KEY)).toBe("200");

      // A choice made since then is kept, whatever the screen.
      create().setInterfaceSize("100");
      expect(create().interfaceSize()).toBe("100");
    });

    it("maps screen widths to the largest size that does not exceed the old scale", () => {
      expect(interfaceSizeForScreen(390)).toBe("100");
      expect(interfaceSizeForScreen(1920)).toBe("100");
      expect(interfaceSizeForScreen(2560)).toBe("125");
      expect(interfaceSizeForScreen(3440)).toBe("150");
      expect(interfaceSizeForScreen(3840)).toBe("200");
      expect(interfaceSizeForScreen(7680)).toBe("200");
      expect(INTERFACE_SIZES.map((size) => size.key)).toEqual(["100", "125", "150", "200"]);
    });
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
    expect(keys).toEqual(["zinc", "blue", "indigo", "emerald", "violet"]);
    expect(findPalette(DEFAULT_PALETTE)).toBeDefined();
    expect(modes).toEqual(["system", "light", "dark"]);
  });
});
