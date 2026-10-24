import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { of, Subject, take } from "rxjs";
import { Permission, ReceiptProductService, ReceiptProductsView } from "../../open-api";
import { AuthState } from "../../store/auth.state";
import { SetGroupCatalog, SetPermissions } from "../../store/auth.state.actions";
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
      setReceiptProductLabels: jest.fn(),
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

  describe("a receipt split into products by hand", () => {
    const line = (id: number, amount?: string) =>
      ({ id, receiptId: 7, name: `line-${id}`, quantity: "", position: id, amount }) as ReceiptProductsView["products"][number];

    it("invites adding products when a receipt has none and the AI never read it", async () => {
      await render(view({ status: "NOT_QUEUED" }), [Permission.GroupReceiptsUpdate]);

      expect(element("receipt-products-status")?.textContent).toContain("No products yet");
      expect(element("receipt-product-add-row")).not.toBeNull();
    });

    it("drops the status line once lines were added by hand", async () => {
      await render(view({ status: "NOT_QUEUED", products: [line(1, "2.00")] }));

      expect(element("receipt-products-status")).toBeNull();
    });

    it("says how much of the total no line covers yet", async () => {
      await render(view({ status: "NOT_QUEUED", products: [line(1, "10.10"), line(2, "0.20"), line(3)] }));
      fixture.componentRef.setInput("receiptAmount", "12.40");
      await fixture.whenStable();

      expect(fixture.componentInstance.unsplitAmount()).toBe("2.10");
      expect(element("receipt-products-unsplit")).not.toBeNull();
    });

    it("says nothing when the lines cover the total, or go over it", async () => {
      await render(view({ products: [line(1, "12.40")] }));
      fixture.componentRef.setInput("receiptAmount", "12.40");
      await fixture.whenStable();
      expect(element("receipt-products-unsplit")).toBeNull();

      fixture.componentRef.setInput("receiptAmount", "10.00");
      await fixture.whenStable();
      expect(fixture.componentInstance.unsplitAmount()).toBeUndefined();
    });
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

      expect(service.addReceiptProduct).toHaveBeenCalledWith(7, { name: "Bread", amount: "1.5", quantity: "", categoryId: undefined, tagIds: [] });
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

      expect(service.updateReceiptProduct).toHaveBeenCalledWith(1, { name: "Oat drink", amount: "2.20", quantity: "1", categoryId: undefined, tagIds: [] });
      expect(element("receipt-product-edit-row")).toBeNull();
      expect(element("receipt-products-table")?.textContent).toContain("Oat drink");
    });
  });

  describe("category and tags on each line", () => {
    const milk = { id: 1, receiptId: 7, name: "LAIT", displayName: "Milk", quantity: "1", position: 0, amount: "1.09", tags: [], categoryOverridden: false };
    const dairy = { id: 10, name: "Dairy" };
    const party = { id: 20, name: "Party" };
    const kids = { id: 21, name: "Kids" };

    const type = async (testId: string, value: string) => {
      const input = element(testId) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input"));
      await fixture.whenStable();
    };

    const renderWithCatalog = async (permissions: string[] = [Permission.GroupReceiptsUpdate]) => {
      TestBed.inject(Store).dispatch(new SetGroupCatalog({ 3: [dairy] }, { 3: [party, kids] }));
      await render(view({ products: [milk] }), permissions);
    };

    it("offers the group's categories and tags by name, and shows Uncategorized without a category", async () => {
      await renderWithCatalog();

      expect(fixture.componentInstance.tagChoices().map((tag) => tag.name)).toEqual(["Kids", "Party"]);
      expect(element("receipt-product-category-picker")?.textContent).toContain("Uncategorized");
    });

    it("saves a picked category through the labels call, never as a rename", async () => {
      await renderWithCatalog();
      service.setReceiptProductLabels.mockReturnValue(of({ ...milk, categoryId: 10, foodGroup: "Dairy", categoryOverridden: true }));

      fixture.componentInstance.setCategory(fixture.componentInstance.view()!.products[0], 10);
      await fixture.whenStable();

      expect(service.setReceiptProductLabels).toHaveBeenCalledWith(1, { categoryId: 10, tagIds: [] });
      expect(service.updateReceiptProduct).not.toHaveBeenCalled();
      expect(element("receipt-product-category-picker")?.textContent).toContain("Dairy");
    });

    it("keeps both tags when two are ticked before the first save answers", async () => {
      await renderWithCatalog();
      const answers = new Subject<any>();
      service.setReceiptProductLabels.mockReturnValue(answers.pipe(take(1)));

      // The open menu still holds the line as it was; the second tick must build on the first.
      const asOpened = fixture.componentInstance.view()!.products[0];
      fixture.componentInstance.toggleTag(asOpened, 20);
      fixture.componentInstance.toggleTag(asOpened, 21);
      await fixture.whenStable();

      expect(element("receipt-product-tags")?.textContent).toContain("Party");
      expect(element("receipt-product-tags")?.textContent).toContain("Kids");

      answers.next({ ...milk, tags: [party] });
      answers.next({ ...milk, tags: [kids, party] });
      await fixture.whenStable();

      expect(service.setReceiptProductLabels).toHaveBeenNthCalledWith(1, 1, { categoryId: undefined, tagIds: [20] });
      expect(service.setReceiptProductLabels).toHaveBeenNthCalledWith(2, 1, { categoryId: undefined, tagIds: [20, 21] });
      expect(fixture.componentInstance.view()!.products[0].tags.map((tag) => tag.name)).toEqual(["Kids", "Party"]);
    });

    it("sends the add row's category and tags with the new line", async () => {
      await renderWithCatalog();
      service.addReceiptProduct.mockReturnValue(of({ ...milk, id: 2, name: "Cake", displayName: "Cake" }));

      fixture.componentInstance.setCategory(undefined, 10);
      fixture.componentInstance.toggleTag(undefined, 20);
      await type("receipt-product-add-name", "Cake");
      element("receipt-product-add")!.click();
      await fixture.whenStable();

      expect(service.addReceiptProduct).toHaveBeenCalledWith(7, { name: "Cake", amount: undefined, quantity: "", categoryId: 10, tagIds: [20] });
      expect(fixture.componentInstance.newTagIds()).toEqual([]);
    });

    it("shows the category and tags as text to people who cannot edit", async () => {
      TestBed.inject(Store).dispatch(new SetGroupCatalog({ 3: [dairy] }, { 3: [party] }));
      await render(view({ products: [{ ...milk, categoryId: 10, foodGroup: "Dairy", tags: [party] }] }));

      expect(element("receipt-product-category-picker")).toBeNull();
      expect(element("receipt-product-tags-picker")).toBeNull();
      expect(element("receipt-product-category")?.textContent).toContain("Dairy");
      expect(element("receipt-product-tags")?.textContent).toContain("Party");
    });
  });
});
