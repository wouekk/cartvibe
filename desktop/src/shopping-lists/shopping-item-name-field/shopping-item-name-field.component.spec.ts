import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { NgxsModule } from "@ngxs/store";
import { ShoppingItemNameFieldComponent } from "./shopping-item-name-field.component";

describe("ShoppingItemNameFieldComponent", () => {
  let fixture: ComponentFixture<ShoppingItemNameFieldComponent>;
  let component: any;
  let control: FormControl<string | null>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingItemNameFieldComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    control = new FormControl<string | null>("");
    fixture = TestBed.createComponent(ShoppingItemNameFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("control", control);
    fixture.componentRef.setInput("suggestions", [{ name: "Milk", amount: "1", unit: "l" }, { name: "Bread" }]);
    await fixture.whenStable();
  });

  it("writes what is typed into the control, as free text", () => {
    component.onSearch("Brand new thing");

    expect(control.value).toBe("Brand new thing");
    expect(control.dirty).toBe(true);
  });

  it("offers matching earlier items while typing", async () => {
    control.setValue("mi");
    await fixture.whenStable();

    expect(component.options().map((option: { name: string }) => option.name)).toEqual(["Milk"]);
  });

  it("follows the control when the parent clears it after an add", async () => {
    control.setValue("mi");
    await fixture.whenStable();
    control.setValue("");
    await fixture.whenStable();

    expect(component.typed()).toBe("");
    expect(component.options()).toEqual([]);
  });

  it("picking a suggestion sets the name and tells the list", () => {
    const picked = jest.fn();
    component.picked.subscribe(picked);

    component.onPick({ name: "Milk", amount: "1", unit: "l" });

    expect(control.value).toBe("Milk");
    expect(picked).toHaveBeenCalledWith({ name: "Milk", amount: "1", unit: "l" });
  });

  it("ignores an empty pick", () => {
    const picked = jest.fn();
    component.picked.subscribe(picked);

    component.onPick(null);

    expect(picked).not.toHaveBeenCalled();
  });
});
