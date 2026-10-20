import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { Permission, ReceiptProductService, ReceiptProductsView } from "../../open-api";
import { AuthState } from "../../store/auth.state";
import { SetPermissions } from "../../store/auth.state.actions";
import { SystemSettingsState } from "../../store/system-settings.state";
import { ReceiptProductsComponent } from "./receipt-products.component";

const view = (overrides: Partial<ReceiptProductsView>): ReceiptProductsView => ({
  status: "DONE",
  lastError: "",
  products: [],
  ...overrides,
});

describe("ReceiptProductsComponent", () => {
  let fixture: ComponentFixture<ReceiptProductsComponent>;
  let service: { [method: string]: jest.Mock };

  const element = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  const render = async (initial: ReceiptProductsView, permissions: string[] = []) => {
    service.getReceiptProducts.mockReturnValue(of(initial));
    TestBed.inject(Store).dispatch(new SetPermissions([], { 3: permissions }));
    fixture = TestBed.createComponent(ReceiptProductsComponent);
    fixture.componentRef.setInput("receiptId", 7);
    fixture.componentRef.setInput("groupId", 3);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    service = {
      getReceiptProducts: jest.fn(),
      readReceiptProducts: jest.fn(),
      addReceiptProduct: jest.fn(),
      updateReceiptProduct: jest.fn(),
      deleteReceiptProduct: jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ReceiptProductsComponent, NgxsModule.forRoot([AuthState, SystemSettingsState])],
      providers: [provideZonelessChangeDetection(), { provide: ReceiptProductService, useValue: service }],
    }).compileComponents();
  });

  it("lists the products, showing the printed line under the plain name", async () => {
    await render(
      view({
        products: [
          { id: 1, receiptId: 7, name: "LAIT DEMI-ECR 1L", displayName: "Semi-skimmed milk", quantity: "1", position: 0, amount: "1.09" },
        ],
      })
    );

    const table = element("receipt-products-table")?.textContent ?? "";
    expect(service.getReceiptProducts).toHaveBeenCalledWith(7);
    expect(table).toContain("Semi-skimmed milk");
    expect(table).toContain("LAIT DEMI-ECR 1L");
  });

  it("marks a product that was not on the shopping list, and only that one", async () => {
    await render(
      view({
        products: [
          { id: 1, receiptId: 7, name: "CHIPS", displayName: "Crisps", quantity: "", position: 0, planned: false },
          { id: 2, receiptId: 7, name: "LAIT", displayName: "Milk", quantity: "", position: 1, planned: true },
          { id: 3, receiptId: 7, name: "PAIN", displayName: "Bread", quantity: "", position: 2 },
        ],
      })
    );

    const marks = fixture.nativeElement.querySelectorAll('[data-testid="receipt-product-unplanned"]');
    expect(marks.length).toBe(1);
    expect(marks[0].closest("tr").textContent).toContain("Crisps");
  });

  it("explains a receipt whose AI could not be reached", async () => {
    await render(view({ status: "UNAVAILABLE", lastError: "The AI was not available: timeout" }));

    expect(element("receipt-products-status")?.textContent).toContain("try again automatically");
  });

  it("offers Read again only with update permission, and queues the read", async () => {
    await render(view({ status: "FAILED" }));
    expect(element("receipt-products-read-again")).toBeNull();

    await render(view({ status: "FAILED" }), [Permission.GroupReceiptsUpdate]);
    service.readReceiptProducts.mockReturnValue(of(view({ status: "PENDING" })));

    element("receipt-products-read-again")!.click();
    await fixture.whenStable();

    expect(service.readReceiptProducts).toHaveBeenCalledWith(7);
    expect(element("receipt-products-status")?.textContent).toContain("Waiting to be read");
  });

  describe("editing the list (Phase 3 C5)", () => {
    const milk = { id: 1, receiptId: 7, name: "LAIT", displayName: "Milk", quantity: "1", position: 0, amount: "1.09" };

    const type = async (testId: string, value: string) => {
      const input = element(testId) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input"));
      await fixture.whenStable();
    };

    it("shows no editing controls without update permission", async () => {
      await render(view({ products: [milk] }));

      expect(element("receipt-product-add-row")).toBeNull();
      expect(element("receipt-product-edit")).toBeNull();
      expect(element("receipt-product-delete")).toBeNull();
    });

    it("adds a product with a comma price and appends it to the list", async () => {
      await render(view({ products: [milk] }), [Permission.GroupReceiptsUpdate]);
      service.addReceiptProduct.mockReturnValue(
        of({ id: 2, receiptId: 7, name: "Bread", displayName: "Bread", quantity: "", position: 1, amount: "1.5" })
      );

      await type("receipt-product-add-name", "Bread");
      await type("receipt-product-add-amount", "1,5");
      element("receipt-product-add")!.click();
      await fixture.whenStable();

      expect(service.addReceiptProduct).toHaveBeenCalledWith(7, { name: "Bread", amount: "1.5", quantity: "" });
      expect(element("receipt-products-table")?.textContent).toContain("Bread");
      expect((element("receipt-product-add-name") as HTMLInputElement).value).toBe("");
    });

    it("refuses a price that is not a number, without calling the API", async () => {
      await render(view({ products: [milk] }), [Permission.GroupReceiptsUpdate]);

      await type("receipt-product-add-name", "Bread");
      await type("receipt-product-add-amount", "lots");
      element("receipt-product-add")!.click();
      await fixture.whenStable();

      expect(service.addReceiptProduct).not.toHaveBeenCalled();
      expect(element("receipt-product-form-error")?.textContent).toContain("amount");
    });

    it("edits a line in place and shows the saved line", async () => {
      await render(view({ products: [milk] }), [Permission.GroupReceiptsUpdate]);
      service.updateReceiptProduct.mockReturnValue(of({ ...milk, name: "Oat drink", displayName: "Oat drink", amount: "2.2" }));

      element("receipt-product-edit")!.click();
      await fixture.whenStable();
      await type("receipt-product-edit-name", "Oat drink");
      await type("receipt-product-edit-amount", "2,20");
      element("receipt-product-save")!.click();
      await fixture.whenStable();

      expect(service.updateReceiptProduct).toHaveBeenCalledWith(1, { name: "Oat drink", amount: "2.20", quantity: "1" });
      expect(element("receipt-product-edit-row")).toBeNull();
      expect(element("receipt-products-table")?.textContent).toContain("Oat drink");
    });
  });
});
