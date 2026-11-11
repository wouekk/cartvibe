import { TranslatePipe } from "../../i18n/translate.pipe";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { TextareaComponent } from "./textarea.component";

describe("TextareaComponent", () => {
  let component: TextareaComponent;
  let fixture: ComponentFixture<TextareaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [TranslatePipe, ReactiveFormsModule, TextareaComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
}).compileComponents();

    fixture = TestBed.createComponent(TextareaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("shows the label and a hint under the field", async () => {
    fixture.componentRef.setInput("label", "Comment");
    fixture.componentRef.setInput("hint", "A hint");
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("label").textContent).toContain("Comment");
    expect(fixture.nativeElement.textContent).toContain("A hint");
  });

  it("writes what is typed to the form control", () => {
    fixture.componentRef.setInput("inputFormControl", new FormControl(""));
    fixture.detectChanges();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector("textarea");

    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input"));

    expect(component.inputFormControl.value).toBe("hello");
  });

  it("gives each textarea its own id and points its label at it", async () => {
    fixture.componentRef.setInput("label", "Comment");
    const other = TestBed.createComponent(TextareaComponent);
    other.componentRef.setInput("label", "Other");
    await fixture.whenStable();
    await other.whenStable();

    const first: HTMLTextAreaElement = fixture.nativeElement.querySelector("textarea");
    const second: HTMLTextAreaElement = other.nativeElement.querySelector("textarea");

    expect(first.id).not.toBe("");
    expect(first.id).not.toBe(second.id);
    expect(fixture.nativeElement.querySelector("label").getAttribute("for")).toBe(first.id);
    expect(other.nativeElement.querySelector("label").getAttribute("for")).toBe(second.id);
  });
});
