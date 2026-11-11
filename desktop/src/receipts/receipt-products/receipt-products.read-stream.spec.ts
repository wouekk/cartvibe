import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, Subject } from "rxjs";
import type { Mock } from "vitest";
import { Permission, ReceiptProductService, ReceiptProductsView } from "../../open-api";
import { ReceiptReadStreamService } from "../../services/receipt-read-stream.service";
import { AuthStore } from "../../store";
import { ReceiptProductsComponent } from "./receipt-products.component";

const view = (status: string, products: unknown[] = []): ReceiptProductsView =>
  ({ status, lastError: "", products }) as ReceiptProductsView;

const milk = { id: 1, receiptId: 7, name: "LAIT", displayName: "Milk", quantity: "", position: 0 };

describe("ReceiptProductsComponent while the AI reads the receipt", () => {
  let fixture: ComponentFixture<ReceiptProductsComponent>;
  let getReceiptProducts: Mock;
  let watch: Mock;
  let stream: Subject<void>;

  const element = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const render = async (permissions: string[]) => {
    TestBed.inject(AuthStore).setPermissions([], { 3: permissions });
    fixture = TestBed.createComponent(ReceiptProductsComponent);
    fixture.componentRef.setInput("receiptId", 7);
    fixture.componentRef.setInput("groupId", 3);
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    stream = new Subject<void>();
    watch = vi.fn().mockImplementation(() => stream.asObservable());
    getReceiptProducts = vi.fn().mockReturnValue(of(view("PENDING")));

    await TestBed.configureTestingModule({
      imports: [ReceiptProductsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReceiptProductService, useValue: { getReceiptProducts } },
        { provide: ReceiptReadStreamService, useValue: { watch } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  const withLists = [Permission.GroupReceiptsRead, Permission.GroupShoppingListsRead];

  it("shows the lines the moment the stream says the receipt was read, without asking on a timer", async () => {
    await render(withLists);
    expect(watch).toHaveBeenCalledWith(3, 7);
    expect(getReceiptProducts).toHaveBeenCalledTimes(1);

    // The stream opened: one read in case the event went by just before, and from then on no timer.
    stream.next();
    expect(getReceiptProducts).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(getReceiptProducts).toHaveBeenCalledTimes(2);

    getReceiptProducts.mockReturnValue(of(view("DONE", [milk])));
    stream.next();
    await vi.advanceTimersByTimeAsync(0);

    expect(getReceiptProducts).toHaveBeenCalledTimes(3);
    expect(element("receipt-products-table")?.textContent).toContain("Milk");
    // Read: nothing is left to wait for, so the stream is closed.
    expect(stream.observed).toBe(false);
  });

  it("asks every half minute when the household's lists (and so its stream) are out of reach", async () => {
    await render([Permission.GroupReceiptsRead]);

    expect(watch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getReceiptProducts).toHaveBeenCalledTimes(2);
  });

  it("asks on the timer until the stream has opened", async () => {
    await render(withLists);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(getReceiptProducts).toHaveBeenCalledTimes(2);
  });

  it("falls back to the timer when the stream gives up", async () => {
    await render(withLists);
    stream.next();
    expect(getReceiptProducts).toHaveBeenCalledTimes(2);

    stream.error(new Error("closed"));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(getReceiptProducts).toHaveBeenCalledTimes(3);
  });

  it("opens no stream for a receipt that is not being read", async () => {
    getReceiptProducts.mockReturnValue(of(view("DONE", [milk])));

    await render(withLists);

    expect(watch).not.toHaveBeenCalled();
  });

  it("closes the stream when the page is left", async () => {
    await render(withLists);
    expect(stream.observed).toBe(true);

    fixture.destroy();

    expect(stream.observed).toBe(false);
  });
});
