import { TestBed } from "@angular/core/testing";
import { HlmSidebarService } from "@spartan-ng/helm/sidebar";

// The sidebar remembers open/closed in localStorage, never in a cookie: the project site and the demo share the
// cartvibe.app origin and promise no cookies (tools/spartan-add.cjs patches the generated service).
const KEY = "cartvibe.sidebarOpen";

function clearCookie(): void {
  document.cookie = "sidebar_state=; path=/; max-age=0";
}

function freshService(): HlmSidebarService {
  TestBed.resetTestingModule();
  return TestBed.inject(HlmSidebarService);
}

describe("sidebar open state", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
    clearCookie();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(KEY);
    clearCookie();
  });

  it("is kept in localStorage and never written to a cookie", () => {
    const service = freshService();
    expect(service.open()).toBe(true);

    service.setOpen(false);

    expect(localStorage.getItem(KEY)).toBe("false");
    expect(document.cookie).not.toContain("sidebar_state");
  });

  it("comes back from localStorage", () => {
    localStorage.setItem(KEY, "false");
    expect(freshService().open()).toBe(false);

    localStorage.setItem(KEY, "true");
    expect(freshService().open()).toBe(true);
  });

  it("takes the choice from an older version's cookie once, then deletes the cookie", () => {
    document.cookie = "sidebar_state=false; path=/";
    expect(document.cookie).toContain("sidebar_state=false");

    const service = freshService();

    expect(service.open()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
    expect(document.cookie).not.toContain("sidebar_state");
  });

  it("still toggles when storage is blocked, without falling back to a cookie", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const service = freshService();

    expect(() => service.setOpen(false)).not.toThrow();
    expect(service.open()).toBe(false);
    expect(document.cookie).not.toContain("sidebar_state");
  });
});
