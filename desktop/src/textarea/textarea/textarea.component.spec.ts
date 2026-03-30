import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TextareaComponent } from "./textarea.component";

describe("TextareaComponent", () => {
  let component: TextareaComponent;
  let fixture: ComponentFixture<TextareaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TextareaComponent],
      imports: [
        MatFormFieldModule,
        MatInputModule,
        ReactiveFormsModule,
        NoopAnimationsModule,
        MatAutocompleteModule
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TextareaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should set selection end to where word was inserted", () => {
    fixture.componentRef.setInput('trigger', "@");
    component.inputFormControl = new FormControl("hello @trigger world");
    component.lastKnownSelection = 6;
    fixture.detectChanges();

    // Mock the matAutocompleteTrigger closePanel
    jest.spyOn(component.matAutocompleteTrigger(), "closePanel").mockImplementation(() => {});

    // Access the viewChild textarea and set selectionEnd
    const textareaEl = component.textarea();
    textareaEl.nativeElement.selectionEnd = 6;

    component.onOptionSelected();

    expect(textareaEl.nativeElement.selectionEnd).toBe(15);
  });
});
