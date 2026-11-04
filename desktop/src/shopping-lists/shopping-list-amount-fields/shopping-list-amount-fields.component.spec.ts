import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormBuilder, FormGroup } from "@angular/forms";
import { provideRouter } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { ShoppingListItem } from "../../open-api";
import { buildShoppingListItemForm } from "../shopping-list-item-form";
import { ShoppingListsModule } from "../shopping-lists.module";
import { ShoppingListAmountFieldsComponent } from "./shopping-list-amount-fields.component";

describe("ShoppingListAmountFieldsComponent", () => {
  let fixture: ComponentFixture<ShoppingListAmountFieldsComponent>;
  let form: FormGroup;

  const amountInput = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('[data-testid="shopping-list-amount"] input');

  const type = async (value: string) => {
    const input = amountInput();
    input.value = value;
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    await fixture.whenStable();
  };

  const setUp = async (item?: ShoppingListItem) => {
    await TestBed.configureTestingModule({
      imports: [ShoppingListsModule, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
    form = buildShoppingListItemForm(TestBed.inject(FormBuilder), item);
    fixture = TestBed.createComponent(ShoppingListAmountFieldsComponent);
    fixture.componentRef.setInput("form", form);
    await fixture.whenStable();
  };

  it("labels both fields and starts a new item in pieces", async () => {
    await setUp();

    expect(fixture.nativeElement.textContent).toContain("Amount");
    expect(fixture.nativeElement.textContent).toContain("Unit");
    expect(form.value.unit).toBe("pcs");
    expect(fixture.nativeElement.querySelector('[data-testid="shopping-list-unit"]').textContent).toContain("pcs");
  });

  it("shows an item's own amount and unit", async () => {
    await setUp({ id: 1, shoppingListId: 1, name: "Flour", amount: "2", unit: "kg" } as unknown as ShoppingListItem);

    expect(amountInput().value).toBe("2");
    expect(form.value.unit).toBe("kg");
  });

  it("writes what is typed into the form, accepting a decimal comma", async () => {
    await setUp();

    await type("1,25");

    expect(form.value.amount).toBe("1,25");
    expect(form.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it("explains an amount the API would refuse", async () => {
    await setUp();

    for (const bad of ["0", "1.2345", "-1", "abc"]) {
      await type(bad);
      expect(form.get("amount")?.invalid).toBe(true);
      expect(fixture.nativeElement.textContent).toContain("Enter a number above 0, up to 3 decimals");
    }
  });
});
