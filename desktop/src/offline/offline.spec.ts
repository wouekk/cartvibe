import { OfflineStorageService } from "./offline-storage.service";
import { isWorthRetrying, RetryWhenReachable } from "./retry-when-reachable";

describe("OfflineStorageService (no IndexedDB: the unit-test DOM, a private window)", () => {
  let storage: OfflineStorageService;

  beforeEach(() => {
    storage = new OfflineStorageService();
  });

  it("keeps values in memory, so the calls work and never reject", async () => {
    expect(await storage.get("missing")).toBeUndefined();

    await storage.set("a:1", { lists: [1, 2] });
    await storage.set("a:2", "two");
    await storage.set("b:1", 3);

    expect(await storage.get("a:1")).toEqual({ lists: [1, 2] });
    expect(await storage.keys("a:")).toEqual(["a:1", "a:2"]);

    await storage.remove("a:1");
    expect(await storage.keys("a:")).toEqual(["a:2"]);

    await storage.clear();
    expect(await storage.keys("")).toEqual([]);
  });

  it("falls back to memory when the browser refuses to open the database", async () => {
    const failing = {
      open: () => {
        const request: { onerror?: () => void } = {};
        setTimeout(() => request.onerror?.());
        return request;
      },
    };
    vi.stubGlobal("indexedDB", failing);
    try {
      const refused = new OfflineStorageService();
      await refused.set("key", "value");
      expect(await refused.get("key")).toBe("value");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("isWorthRetrying", () => {
  it.each([0, 408, 429, 500, 502, 503, 504])("waits on %s", (status) => {
    expect(isWorthRetrying({ status })).toBe(true);
  });

  it.each([400, 401, 403, 404, 409, 413])("takes %s as the server's answer", (status) => {
    expect(isWorthRetrying({ status })).toBe(false);
  });

  it("waits on an error that is not an HTTP answer at all", () => {
    expect(isWorthRetrying(new Error("boom"))).toBe(true);
    expect(isWorthRetrying(undefined)).toBe(true);
  });
});

describe("RetryWhenReachable", () => {
  let retry: RetryWhenReachable;

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    retry.dispose();
    vi.useRealTimers();
  });

  it("runs the work once when it is done at the first try", async () => {
    const work = vi.fn().mockResolvedValue(true);
    retry = new RetryWhenReachable(document, work);

    await retry.run();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(work).toHaveBeenCalledTimes(1);
  });

  it("backs off from 2 to 30 seconds while the server cannot be reached", async () => {
    const work = vi.fn().mockResolvedValue(false);
    retry = new RetryWhenReachable(document, work);

    await retry.run();
    expect(work).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1999);
    expect(work).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(2);

    // 4, 8, 16, then 30 seconds and no more.
    await vi.advanceTimersByTimeAsync(4000 + 8000 + 16000);
    expect(work).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(work).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(work).toHaveBeenCalledTimes(7);
  });

  it("tries at once when the browser reports a connection, and starts the back-off over once done", async () => {
    const work = vi.fn().mockResolvedValue(false);
    retry = new RetryWhenReachable(document, work);
    await retry.run();
    await vi.advanceTimersByTimeAsync(2000);
    expect(work).toHaveBeenCalledTimes(2);

    work.mockResolvedValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(3);

    // Done: no timer is left running.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it("runs once more after a run that was asked for while it was busy", async () => {
    let finish!: (done: boolean) => void;
    const work = vi
      .fn()
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)))
      .mockResolvedValue(true);
    retry = new RetryWhenReachable(document, work);

    const first = retry.run();
    retry.kick();
    retry.kick();
    expect(work).toHaveBeenCalledTimes(1);

    finish(true);
    await first;

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("treats work that throws as not done", async () => {
    const work = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(true);
    retry = new RetryWhenReachable(document, work);

    await retry.run();
    await vi.advanceTimersByTimeAsync(2000);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("stops waiting when cancelled or disposed", async () => {
    const work = vi.fn().mockResolvedValue(false);
    retry = new RetryWhenReachable(document, work);
    await retry.run();

    retry.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(work).toHaveBeenCalledTimes(1);

    retry.dispose();
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
