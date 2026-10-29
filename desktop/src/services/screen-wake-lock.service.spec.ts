import { TestBed } from "@angular/core/testing";
import { ScreenWakeLockService } from "./screen-wake-lock.service";

import type { Mock } from "vitest";
function fakeSentinel() {
  const listeners: { [type: string]: (() => void)[] } = {};
  return {
    release: vi.fn().mockImplementation(async () => (listeners["release"] ?? []).forEach((listener) => listener())),
    addEventListener: (type: string, listener: () => void) => (listeners[type] ??= []).push(listener),
  };
}

describe("ScreenWakeLockService", () => {
  let request: Mock;

  function create(): ScreenWakeLockService {
    TestBed.resetTestingModule();
    return TestBed.inject(ScreenWakeLockService);
  }

  function setVisibility(state: "visible" | "hidden"): void {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    request = vi.fn().mockImplementation(async () => fakeSentinel());
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  });

  afterEach(() => {
    delete (navigator as any).wakeLock;
    setVisibility("visible");
  });

  it("takes the lock when asked and reports it enabled", async () => {
    const service = create();

    await expect(service.enable()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith("screen");
    expect(service.enabled()).toBe(true);
  });

  it("falls back to disabled when the browser refuses", async () => {
    request.mockRejectedValue(new Error("NotAllowedError"));
    const service = create();

    await expect(service.enable()).resolves.toBe(false);

    expect(service.enabled()).toBe(false);
  });

  it("releases the lock on disable", async () => {
    const service = create();
    const sentinel = fakeSentinel();
    request.mockResolvedValueOnce(sentinel);
    await service.enable();

    await service.disable();

    expect(sentinel.release).toHaveBeenCalled();
    expect(service.enabled()).toBe(false);
  });

  it("takes the lock again when the tab comes back, because hiding it released the lock", async () => {
    const service = create();
    const first = fakeSentinel();
    request.mockResolvedValueOnce(first);
    await service.enable();

    await first.release();
    setVisibility("visible");
    await Promise.resolve();

    expect(request).toHaveBeenCalledTimes(2);
    expect(service.enabled()).toBe(true);
  });

  it("is unsupported without the Wake Lock API", () => {
    delete (navigator as any).wakeLock;

    expect(create().supported).toBe(false);
  });
});
