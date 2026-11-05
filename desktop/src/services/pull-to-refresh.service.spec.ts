import { TestBed } from "@angular/core/testing";
import { PULL_REFRESH_THRESHOLD, PullToRefreshService } from "./pull-to-refresh.service";

function touch(type: string, y: number, target: EventTarget = document.body): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
  event.touches = type === "touchend" ? [] : [{ clientY: y }];
  target.dispatchEvent(event);
}

describe("PullToRefreshService", () => {
  let reload: ReturnType<typeof vi.fn>;

  function create(standalone: boolean): void {
    vi.stubGlobal("matchMedia", () => ({ matches: standalone }));
    const service = TestBed.inject(PullToRefreshService);
    reload = vi.fn();
    service.reload = reload as unknown as () => void;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    document.querySelectorAll("[data-testid='pull-to-refresh']").forEach((e) => e.remove());
  });

  it("reloads after a long pull down at the top of the page", () => {
    create(true);
    touch("touchstart", 0);
    touch("touchmove", PULL_REFRESH_THRESHOLD * 2 + 10);
    expect(document.querySelector("[data-testid='pull-to-refresh']")).not.toBeNull();
    touch("touchend", 0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload after a short pull, and removes the arrow", () => {
    create(true);
    touch("touchstart", 0);
    touch("touchmove", 40);
    touch("touchend", 0);
    expect(reload).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid='pull-to-refresh']")).toBeNull();
  });

  it("does nothing in a normal browser tab", () => {
    create(false);
    touch("touchstart", 0);
    touch("touchmove", 400);
    touch("touchend", 0);
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a pull that starts inside something already scrolled", () => {
    create(true);
    const list = document.createElement("div");
    document.body.appendChild(list);
    Object.defineProperty(list, "scrollTop", { value: 50 });
    touch("touchstart", 0, list);
    touch("touchmove", 400, list);
    touch("touchend", 0, list);
    list.remove();
    expect(reload).not.toHaveBeenCalled();
  });
});
