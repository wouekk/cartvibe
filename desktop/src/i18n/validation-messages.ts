import { marker } from "./marker";

/**
 * The text for each Angular validation error, as translation keys with parameters. `{label}` is the field's label;
 * the other placeholders come from the error itself (`Validators.min` reports `{ min, actual }`, `minLength`
 * reports `{ requiredLength, actualLength }`). A component's `additionalErrorMessages` overrides these per field, and a
 * custom validator that returns a string uses that string as the key.
 */
export const VALIDATION_MESSAGES: { [error: string]: string } = {
  required: marker("{label} is required."),
  email: marker("{label} must be a valid email address."),
  min: marker("{label} must be at least {min}."),
  max: marker("{label} must be at most {max}."),
  minlength: marker("{label} must be at least {requiredLength} characters."),
  maxlength: marker("{label} must be at most {requiredLength} characters."),
  pattern: marker("{label} is not in the right format."),
  duplicate: marker("{label} must be unique."),
};

/** The numbers and strings an error carries, as `{placeholder}` values (`{ min: 5, actual: 3 }` gives min and actual). */
export function validationParams(error: unknown): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (error && typeof error === "object") {
    for (const [name, value] of Object.entries(error)) {
      if (typeof value === "string" || typeof value === "number") {
        params[name] = value;
      }
    }
  }

  return params;
}
