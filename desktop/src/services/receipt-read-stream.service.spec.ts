import { TestBed } from "@angular/core/testing";
import { ReceiptReadStreamService } from "./receipt-read-stream.service";

/** Just enough of EventSource to drive the service: listeners, readyState and close(). */
class FakeEventSource {
  public readyState = 0;
  public closed = false;
  private listeners: { [type: string]: ((event: unknown) => void)[] } = {};

  constructor(public url: string) {}

  public addEventListener(type: string, listener: (event: unknown) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  public close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  public emit(type: string, event: unknown = {}): void {
    (this.listeners[type] ?? []).forEach((listener) => listener(event));
  }
}

describe("ReceiptReadStreamService", () => {
  let service: ReceiptReadStreamService;
  let source: FakeEventSource;

  beforeEach(() => {
    service = TestBed.inject(ReceiptReadStreamService);
    service.setEventSourceFactory((url) => {
      source = new FakeEventSource(url);
      return source as unknown as EventSource;
    });
  });

  const read = (receiptId: number) => source.emit("RECEIPT_READ", { data: JSON.stringify({ type: "RECEIPT_READ", groupId: 3, shoppingListId: 0, receiptId }) });

  it("listens on the household's stream and tells about its own receipt only", () => {
    const next = vi.fn();
    const subscription = service.watch(3, 42).subscribe(next);

    expect(source.url).toBe("/api/shopping-list/group/3/stream");

    read(41);
    expect(next).not.toHaveBeenCalled();

    read(42);
    expect(next).toHaveBeenCalledTimes(1);

    subscription.unsubscribe();
    expect(source.closed).toBe(true);
  });

  it("tells each time the stream opens, since the event may have gone by just before", () => {
    const next = vi.fn();
    service.watch(3, 42).subscribe(next);

    source.readyState = 1;
    source.emit("open");
    source.emit("open");

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("skips a malformed frame", () => {
    const next = vi.fn();
    service.watch(3, 42).subscribe(next);

    expect(() => source.emit("RECEIPT_READ", { data: "{not json" })).not.toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("stays quiet while the browser reconnects by itself, and errors once it gives up", () => {
    const error = vi.fn();
    service.watch(3, 42).subscribe({ error });

    source.readyState = 0;
    source.emit("error");
    expect(error).not.toHaveBeenCalled();

    // An HTTP error such as a 403 (no access to the household's lists): the caller falls back to asking.
    source.readyState = 2;
    source.emit("error");
    expect(error).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
  });

  it("errors where there is no EventSource to open", () => {
    service.setEventSourceFactory(() => {
      throw new ReferenceError("EventSource is not defined");
    });
    const error = vi.fn();

    service.watch(3, 42).subscribe({ error });

    expect(error).toHaveBeenCalledTimes(1);
  });
});
