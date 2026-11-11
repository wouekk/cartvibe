import { Component, CUSTOM_ELEMENTS_SCHEMA, input, output } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DialogFooterComponent } from "./dialog-footer.component";

// Stubs: the real buttons take an "onlyIcon" input, which Angular refuses to bind on an unknown element.
@Component({
    selector: "app-submit-button", template: "",
})
class SubmitButtonStub {
  public readonly onlyIcon = input(true);
  public readonly buttonText = input<string>();
  public readonly buttonClass = input("");
  public readonly tooltip = input<string>();
  public readonly disabled = input(false);
  public readonly type = input("submit");
  public readonly clicked = output<void>();
}

@Component({
    selector: "app-cancel-button", template: "",
})
class CancelButtonStub {
  public readonly disabled = input(false);
  public readonly clicked = output<void>();
}

describe("DialogFooterComponent", () => {
  let component: DialogFooterComponent;
  let fixture: ComponentFixture<DialogFooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [DialogFooterComponent, SubmitButtonStub, CancelButtonStub],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
}).compileComponents();

    fixture = TestBed.createComponent(DialogFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
