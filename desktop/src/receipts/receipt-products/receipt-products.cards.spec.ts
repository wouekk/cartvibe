import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { Permission, ReceiptProductService, ReceiptProductsView } from "../../open-api";
import { ViewportService } from "../../services/viewport.service";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ReceiptProductsComponent } from "./receipt-products.component";

import type { Mock } from "vitest";

const MILK = { id: 1, receiptId: 7, name: "LAIT DEMI-ECR 1L", displayName: "Semi-skimmed milk", quantity: "2", position: 0, amount: "1.09", health: "HEALTHY" };
const BAG = { id: 2, receiptId: 7, name: "Bag", displayName: "Bag", quantity: "", position: 1, planned: false };

const view = (): ReceiptProductsView => ({ status: "DONE", lastError: "", products: [MILK, BAG] }) as unknown as ReceiptProductsView;

/** The product lines of a receipt on a phone: one card per line, with the row's actions in one menu. */
describe("ReceiptProductsComponent on a phone", () => {
  let fixture: ComponentFixture<ReceiptProductsComponent>;
  let service: Record<"getReceiptProducts" | "updateReceiptProduct" | "deleteReceiptProduct", Mock>;
  const isHandset = signal(true);

  const element = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const cards = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll("[data-testid=receipt-product-card]"));
  // The menu opens in an overlay, outside the component's own element.
  const menuItem = (testId: string): HTMLElement | null => document.querySelector(`[data-testid="${testId}"]`);

  const render = async (permissions: string[] = [Permission.GroupReceiptsUpdate]) => {
    TestBed.inject(Store).dispatch(new SetPermissions([], { 3: permissions }));
    fixture = TestBed.createComponent(ReceiptProductsComponent);
    fixture.componentRef.setInput("receiptId", 7);
    fixture.componentRef.setInput("groupId", 3);
    await fixture.whenStable();
  };

  const openMenu = async (card: HTMLElement) => {
    (card.querySelector("[data-testid=receipt-product-menu]") as HTMLElement).click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    isHandset.set(true);
    service = {
      getReceiptProducts: vi.fn().mockReturnValue(of(view())),
      updateReceiptProduct: vi.fn().mockReturnValue(of({ ...MILK, displayName: "Oat drink" })),
      deleteReceiptProduct: vi.fn().mockReturnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [ReceiptProductsComponent, NgxsModule.forRoot([AuthState, SystemSettingsState])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ReceiptProductService, useValue: service },
        { provide: ViewportService, useValue: { isHandset } },
      ],
    }).compileComponents();
  });

  it("shows a card per line instead of the table: name and amount first, the printed line and quantity under them", async () => {
    await render();

    expect(element("receipt-products-table")).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(cards()[0].textContent).toContain("Semi-skimmed milk");
    expect(cards()[0].textContent).toContain("LAIT DEMI-ECR 1L");
    expect(cards()[0].textContent).toContain("1.09");
    expect(cards()[0].querySelector("[data-testid=receipt-product-no-amount]")).toBeNull();
  });

  it("points out a line without an amount, leaves out a printed line that says the same, and marks an unplanned one", async () => {
    await render();

    expect(cards()[1].querySelector("[data-testid=receipt-product-no-amount]")?.textContent).toContain("No amount");
    expect(cards()[1].querySelector("[data-testid=receipt-product-original]")).toBeNull();
    expect(cards()[1].querySelector("[data-testid=receipt-product-unplanned]")).not.toBeNull();
  });

  it("keeps the table on a wider screen", async () => {
    isHandset.set(false);
    await render();

    expect(element("receipt-products-table")).not.toBeNull();
    expect(element("receipt-products-cards")).toBeNull();
  });

  it("offers no row menu to someone who may not change the receipt", async () => {
    await render([]);

    expect(cards()).toHaveLength(2);
    expect(element("receipt-product-menu")).toBeNull();
  });

  it("puts edit, the health correction and a red removal in one menu", async () => {
    await render();
    await openMenu(cards()[0]);

    expect(menuItem("receipt-product-edit")).not.toBeNull();
    expect(menuItem("receipt-product-health-HEALTHY")).not.toBeNull();
    expect(menuItem("receipt-product-delete")?.getAttribute("data-variant")).toBe("destructive");
  });

  it("edits a line in its card and saves it", async () => {
    await render();
    await openMenu(cards()[0]);
    menuItem("receipt-product-edit")!.click();
    await fixture.whenStable();

    const name = element("receipt-product-edit-name") as HTMLInputElement;
    expect(name.value).toBe("Semi-skimmed milk");
    name.value = "Oat drink";
    name.dispatchEvent(new Event("input"));
    element("receipt-product-save")!.click();
    await fixture.whenStable();

    expect(service.updateReceiptProduct).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Oat drink", amount: "1.09", quantity: "2" }));
    expect(element("receipt-product-edit-row")).toBeNull();
  });
});
