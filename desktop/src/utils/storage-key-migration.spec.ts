import { readStorageKey } from "./storage-key-migration";

describe("readStorageKey", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("returns the new key's value and leaves an old one alone", () => {
    localStorage.setItem("cartvibe.themeMode", "light");
    localStorage.setItem("rw_theme_mode", "dark");

    expect(readStorageKey("cartvibe.themeMode")).toBe("light");
    expect(localStorage.getItem("rw_theme_mode")).toBe("dark");
  });

  it("moves a value from the old key once", () => {
    localStorage.setItem("rw_theme_palette", "indigo");

    expect(readStorageKey("cartvibe.themePalette")).toBe("indigo");
    expect(localStorage.getItem("cartvibe.themePalette")).toBe("indigo");
    expect(localStorage.getItem("rw_theme_palette")).toBeNull();
  });

  it("returns null when neither key is stored, or for a key with no old name", () => {
    expect(readStorageKey("cartvibe.themeMode")).toBeNull();
    expect(readStorageKey("cartvibe.language")).toBeNull();
  });

  it("returns null when storage refuses access", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readStorageKey("cartvibe.themeMode")).toBeNull();
  });
});
