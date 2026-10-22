import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, Validators } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import { registerRealLanguages } from "../../i18n/i18n-test-utils";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { TranslationService } from "../../i18n/translation.service";
import { BaseInputComponent } from "./base-input.component";

describe("BaseInputComponent validation messages", () => {
  let fixture: ComponentFixture<BaseInputComponent>;
  let component: BaseInputComponent;
  let translation: TranslationService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [TranslatePipe], declarations: [BaseInputComponent] }).compileComponents();
    translation = TestBed.inject(TranslationService);
    registerRealLanguages(translation);
    fixture = TestBed.createComponent(BaseInputComponent);
    component = fixture.componentInstance;
  });

  const errors = async () => firstValueFrom(component.formControlErrors);

  it("fills the label and the limit into the English text", async () => {
    component.label = "Amount";
    component.inputFormControl = new FormControl(1, Validators.min(5));
    component.ngOnInit();

    const [error] = await errors();

    expect(error.key).toBe("{label} must be at least {min}.");
    expect(error.message).toBe("Amount must be at least 5.");
    expect(component.errorText(error)).toBe("Amount must be at least 5.");
  });

  it("uses a string returned by a custom validator as the key", async () => {
    component.inputFormControl = new FormControl("x", () => ({ custom: "Pick something else" }));
    component.ngOnInit();

    const [error] = await errors();

    expect(error.key).toBe("Pick something else");
    expect(component.errorText(error)).toBe("Pick something else");
  });

  it("lets additionalErrorMessages override a default", async () => {
    component.label = "Name";
    component.inputFormControl = new FormControl("", Validators.required);
    component.additionalErrorMessages = { required: "Please name it." };
    component.ngOnInit();

    const [error] = await errors();

    expect(component.errorText(error)).toBe("Please name it.");
  });

  it("follows the language: the label is translated first, then the message", async () => {
    component.label = "Amount";
    component.inputFormControl = new FormControl("", Validators.required);
    component.ngOnInit();
    const [error] = await errors();
    translation.register("pl", {
      messages: { Amount: "Kwota", "{label} is required.": "Pole {label} jest wymagane." },
    });

    translation.choose("pl");
    expect(component.errorText(error)).toBe("Pole Kwota jest wymagane.");

    translation.choose("en");
    expect(component.errorText(error)).toBe("Amount is required.");
  });

  it("shows nothing for an error with no message", async () => {
    component.inputFormControl = new FormControl("x", () => ({ unknownError: true }));
    component.ngOnInit();

    const [error] = await errors();

    expect(component.errorText(error)).toBe("");
  });
});
