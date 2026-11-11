import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { StateStorage } from "./state-storage";
import { StateStore } from "./state-store";

interface Sample {
  page: number;
  name: string;
  added?: string;
}

@Injectable({ providedIn: "root" })
class KeptStore extends StateStore<Sample> {
  constructor() {
    super(() => ({ page: 1, name: "", added: "new default" }), "sample");
  }

  public setPage(page: number): void {
    this.patch({ page });
  }

  public rename(name: string): void {
    this.replace({ page: this.state().page, name });
  }

  public clear(): void {
    this.reset();
  }
}

@Injectable({ providedIn: "root" })
class VisitStore extends StateStore<Sample> {
  constructor() {
    super(() => ({ page: 1, name: "" }));
  }

  public setPage(page: number): void {
    this.patch({ page });
  }
}

describe("StateStore", () => {
  let storage: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

  function provide(kept: unknown): void {
    storage = { read: vi.fn().mockReturnValue(kept), write: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: StateStorage, useValue: storage }] });
  }

  it("starts from the defaults when nothing was kept", () => {
    provide(undefined);

    expect(TestBed.inject(KeptStore).state()).toEqual({ page: 1, name: "", added: "new default" });
    expect(storage.read).toHaveBeenCalledWith("sample");
  });

  it("lays what was kept over the defaults, so a key added later starts at its default", () => {
    provide({ page: 7, name: "kept by an older version" });

    expect(TestBed.inject(KeptStore).state()).toEqual({ page: 7, name: "kept by an older version", added: "new default" });
  });

  it.each([null, "text", 12, [1, 2]])("starts from the defaults when what was kept is not a slice (%s)", (kept) => {
    provide(kept);

    expect(TestBed.inject(KeptStore).state()).toEqual({ page: 1, name: "", added: "new default" });
  });

  it("keeps the whole slice after each change", () => {
    provide(undefined);
    const store = TestBed.inject(KeptStore);

    store.setPage(3);

    expect(store.state().page).toBe(3);
    expect(storage.write).toHaveBeenLastCalledWith("sample", { page: 3, name: "", added: "new default" });

    store.rename("renamed");

    expect(store.state()).toEqual({ page: 3, name: "renamed" });
    expect(storage.write).toHaveBeenLastCalledWith("sample", { page: 3, name: "renamed" });
  });

  it("goes back to the defaults on a reset, and keeps that too", () => {
    provide({ page: 9, name: "kept" });
    const store = TestBed.inject(KeptStore);

    store.clear();

    expect(store.state()).toEqual({ page: 1, name: "", added: "new default" });
    expect(storage.write).toHaveBeenLastCalledWith("sample", { page: 1, name: "", added: "new default" });
  });

  it("hands out a new slice on each change, so a reader's signal sees it", () => {
    provide(undefined);
    const store = TestBed.inject(KeptStore);
    const before = store.state();

    store.setPage(2);

    expect(store.state()).not.toBe(before);
    expect(before.page).toBe(1);
  });

  it("neither reads nor writes storage without a key", () => {
    provide({ page: 5 });
    const store = TestBed.inject(VisitStore);

    store.setPage(2);

    expect(store.state()).toEqual({ page: 2, name: "" });
    expect(storage.read).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
  });
});

describe("StateStorage", () => {
  let storage: StateStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new StateStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps a slice as JSON under its key, as the NGXS storage plugin did", () => {
    storage.write("userTable", { page: 2, pageSize: 50 });

    expect(localStorage.getItem("userTable")).toBe('{"page":2,"pageSize":50}');
    expect(storage.read("userTable")).toEqual({ page: 2, pageSize: 50 });
  });

  it("answers undefined for a key that was never written, and for something that is not JSON", () => {
    localStorage.setItem("broken", "{not json");

    expect(storage.read("missing")).toBeUndefined();
    expect(storage.read("broken")).toBeUndefined();
  });

  it("survives a browser that blocks storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(storage.read("userTable")).toBeUndefined();
    expect(() => storage.write("userTable", { page: 1 })).not.toThrow();
  });
});
