import { Component, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
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

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ShoppingItemNameFieldComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submitted = submitted + 1">
      <app-shopping-item-name-field [control]="form.controls.name" [suggestions]="suggestions" />
    </form>
  `,
})
class NameFieldInFormHostComponent {
  public readonly form = new FormGroup({ name: new FormControl<string | null>("") });
  public suggestions = [{ name: "Milk" }];
  public submitted = 0;
}

// spartan's autocomplete input cancels every Enter (it picks the highlighted suggestion), which also cancelled the form's
// own submit: a typed name was never added with Enter. These drive the real input inside a real form.
describe("ShoppingItemNameFieldComponent inside the add form", () => {
  let fixture: ComponentFixture<NameFieldInFormHostComponent>;
  let input: HTMLInputElement;

  const pressEnter = (): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NameFieldInFormHostComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(NameFieldInFormHostComponent);
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector("input");
  });

  it("submits the form when Enter is pressed on a typed name", async () => {
    input.value = "Eggs";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await fixture.whenStable();

    pressEnter();

    expect(fixture.componentInstance.submitted).toBe(1);
  });

  it("leaves Enter to the suggestion list while a suggestion is highlighted", async () => {
    input.setAttribute("aria-activedescendant", "suggestion-1");

    pressEnter();

    expect(fixture.componentInstance.submitted).toBe(0);
  });
});
