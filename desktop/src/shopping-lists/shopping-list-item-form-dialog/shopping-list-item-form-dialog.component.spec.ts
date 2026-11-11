import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { of } from "rxjs";
import type { Mock } from "vitest";
import { AppDialogRef } from "../../dialog/app-dialog";
import { ShoppingListItem, ShoppingListService } from "../../open-api";
import { ShoppingListEventType } from "../../store/shopping-list.store";
import { ShoppingListStore } from "../../store/shopping-list.store";
import { ShoppingListsModule } from "../shopping-lists.module";
import { ShoppingListItemFormDialogComponent } from "./shopping-list-item-form-dialog.component";

const oldMilk = {
  id: 9,
  shoppingListId: 3,
  name: "Milk",
  unit: "",
  quantity: "2 cartons",
  note: "",
  isChecked: false,
} as unknown as ShoppingListItem;

describe("ShoppingListItemFormDialogComponent", () => {
  let fixture: ComponentFixture<ShoppingListItemFormDialogComponent>;
  let service: { updateShoppingListItem: Mock };
  let dialogRef: { close: Mock };
  let applyEvent: Mock;

  const el = (testId: string): HTMLElement | null => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const input = (testId: string): HTMLInputElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"] input`);

  const type = async (testId: string, value: string) => {
    const field = input(testId);
    field.value = value;
    field.dispatchEvent(new Event("input"));
    await fixture.whenStable();
  };

  const submit = async () => {
    fixture.nativeElement.querySelector("form").dispatchEvent(new Event("submit"));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    service = { updateShoppingListItem: vi.fn((id: number, command: object) => of({ ...oldMilk, ...command, id })) };
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ShoppingListsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: ShoppingListService, useValue: service },
      ],
    }).compileComponents();

    applyEvent = vi.spyOn(TestBed.inject(ShoppingListStore), "applyEvent") as unknown as Mock;
    fixture = TestBed.createComponent(ShoppingListItemFormDialogComponent);
    fixture.componentInstance.groupId = 5;
    fixture.componentInstance.item = oldMilk;
    await fixture.whenStable();
  });

  it("opens with the item's name and tells what the old free-text quantity was", () => {
    expect(input("shopping-list-item-edit-name").value).toBe("Milk");
    expect(el("shopping-list-item-legacy-quantity")?.textContent).toContain('Currently "2 cartons"');
  });

  it("keeps the old quantity when no amount is entered", async () => {
    await type("shopping-list-item-edit-note", "  semi-skimmed ");
    await submit();

    expect(service.updateShoppingListItem).toHaveBeenCalledWith(9, {
      name: "Milk",
      unit: "",
      quantity: "2 cartons",
      note: "semi-skimmed",
    });
  });

  it("replaces the old quantity with an amount, sends a dot, and updates the list for everyone", async () => {
    await type("shopping-list-amount", "1,5");
    expect(el("shopping-list-item-legacy-quantity")).toBeNull();

    await submit();

    expect(service.updateShoppingListItem).toHaveBeenCalledWith(9, {
      name: "Milk",
      amount: "1.5",
      unit: "pcs",
      quantity: "",
      note: "",
    });
    const saved = dialogRef.close.mock.calls[0][0] as ShoppingListItem;
    expect(saved.id).toBe(9);
    expect(applyEvent).toHaveBeenCalledWith({ type: ShoppingListEventType.ItemUpdated, groupId: 5, shoppingListId: 3, item: saved });
  });

  it("refuses a blank name or a bad amount without calling the API", async () => {
    await type("shopping-list-item-edit-name", "   ");
    await submit();
    await type("shopping-list-item-edit-name", "Milk");
    await type("shopping-list-amount", "0");
    await submit();

    expect(service.updateShoppingListItem).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Enter a number above 0, up to 3 decimals");
  });

  it("closes with nothing on cancel", () => {
    fixture.componentInstance.closeDialog();

    expect(dialogRef.close).toHaveBeenCalledWith();
    expect(service.updateShoppingListItem).not.toHaveBeenCalled();
  });
});
