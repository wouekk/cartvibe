import { TestBed } from "@angular/core/testing";
import { Store } from "@ngxs/store";
import { ApplyShoppingListEvent, LoadShoppingLists } from "../store/shopping-list.state.actions";
import { ShoppingListStreamService } from "./shopping-list-stream.service";

import type { Mock } from "vitest";
/** Just enough of EventSource to drive the service: listeners, readyState and close(). */
class FakeEventSource {
  public readyState = 0;
  public closed = false;
  private listeners: { [type: string]: ((event: any) => void)[] } = {};

  constructor(public url: string) {}

  public addEventListener(type: string, listener: (event: any) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  public close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  public emit(type: string, event: any = {}): void {
    (this.listeners[type] ?? []).forEach((listener) => listener(event));
  }

  public open(): void {
    this.readyState = 1;
    this.emit("open");
  }

  /** What the browser does on an HTTP error such as a 403: give up for good. */
  public failPermanently(): void {
    this.readyState = 2;
    this.emit("error");
  }
}

describe("ShoppingListStreamService", () => {
  let service: ShoppingListStreamService;
  let dispatch: Mock;
  let sources: FakeEventSource[];

  const latest = () => sources[sources.length - 1];

  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    dispatch = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: Store, useValue: { dispatch } }],
    });

    service = TestBed.inject(ShoppingListStreamService);
    sources = [];
    service.setEventSourceFactory((url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source as unknown as EventSource;
    });
  });

  afterEach(() => {
    service.disconnect();
    vi.useRealTimers();
  });

  it("opens the group's stream and applies its events", () => {
    service.connect(3);
    latest().open();

    const event = { type: "ITEM_ADDED", groupId: 3, shoppingListId: 1, item: { id: 1 } };
    latest().emit("ITEM_ADDED", { data: JSON.stringify(event) });

    expect(latest().url).toBe("/api/shopping-list/group/3/stream");
    expect(dispatch).toHaveBeenCalledWith(new ApplyShoppingListEvent(event as any));
  });

  it("skips a malformed frame instead of throwing", () => {
    service.connect(3);
    expect(() => latest().emit("ITEM_ADDED", { data: "{not json" })).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not refetch on the first open, but does after a reconnect", () => {
    service.connect(3);
    latest().open();
    expect(dispatch).not.toHaveBeenCalledWith(new LoadShoppingLists(3));

    // The browser's own reconnect after the server's 15-minute close fires open again.
    latest().open();
    expect(dispatch).toHaveBeenCalledWith(new LoadShoppingLists(3));
  });

  it("reconnects with backoff after the browser gives up on the stream", () => {
    service.connect(3);
    latest().failPermanently();
    expect(sources).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(2);

    latest().failPermanently();
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(3);
  });

  it("refetches and reopens a closed stream when the tab becomes visible", () => {
    service.connect(3);
    latest().failPermanently();

    setVisibility("visible");

    expect(dispatch).toHaveBeenCalledWith(new LoadShoppingLists(3));
    expect(sources).toHaveLength(2);
  });

  it("closes the stream and stops listening on disconnect", () => {
    service.connect(3);
    const source = latest();

    service.disconnect();
    setVisibility("visible");
    vi.advanceTimersByTime(60000);

    expect(source.closed).toBe(true);
    expect(sources).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a single stream when switching groups", () => {
    service.connect(3);
    const first = latest();

    service.connect(4);

    expect(first.closed).toBe(true);
    expect(latest().url).toBe("/api/shopping-list/group/4/stream");
  });
});
