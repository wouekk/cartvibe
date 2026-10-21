import { TestBed } from "@angular/core/testing";
import { storedMode, THEME_MODE_STORAGE_KEY, ThemeService } from "./theme.service";

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
    const service = create();

    expect(service.mode()).toBe("system");
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

  it("reads a stored mode on creation and ignores a stored value it does not know", () => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "dark");
    expect(create().mode()).toBe("dark");

    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "sepia");
    expect(create().mode()).toBe("system");
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
});
