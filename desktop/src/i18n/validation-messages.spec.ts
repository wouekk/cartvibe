import { FormControl, Validators } from "@angular/forms";
import { VALIDATION_MESSAGES, validationParams } from "./validation-messages";

describe("validation messages", () => {
  it("maps each Angular error to a key with placeholders", () => {
    expect(VALIDATION_MESSAGES["required"]).toBe("{label} is required.");
    expect(VALIDATION_MESSAGES["min"]).toBe("{label} must be at least {min}.");
    expect(Object.keys(VALIDATION_MESSAGES).sort()).toEqual(["duplicate", "email", "max", "maxlength", "min", "minlength", "pattern", "required"]);
  });

  it("takes the placeholder values from the error", () => {
    const control = new FormControl(3, Validators.min(5));

    expect(validationParams(control.errors?.["min"])).toEqual({ min: 5, actual: 3 });
    expect(validationParams(new FormControl("ab", Validators.minLength(4)).errors?.["minlength"])).toEqual({ requiredLength: 4, actualLength: 2 });
  });

  it("ignores errors that carry no values", () => {
    expect(validationParams(true)).toEqual({});
    expect(validationParams(undefined)).toEqual({});
  });
});
