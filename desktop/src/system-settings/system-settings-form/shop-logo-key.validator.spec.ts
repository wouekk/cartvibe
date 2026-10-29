import { FormControl } from "@angular/forms";
import { SAVED_KEY_PLACEHOLDER } from "../../ai-settings/ai-settings-shared";
import { shopLogoKeyValidator } from "./system-settings-form.component";

describe("shopLogoKeyValidator", () => {
  const check = (value: unknown) => shopLogoKeyValidator()(new FormControl(value));

  it("accepts an empty field (no key), the dots of a saved key, and a secret key", () => {
    expect(check("")).toBeNull();
    expect(check(null)).toBeNull();
    expect(check(SAVED_KEY_PLACEHOLDER)).toBeNull();
    expect(check("sk_ExampleKey12345")).toBeNull();
    expect(check("  sk_abc-DEF_12345  ")).toBeNull();
  });

  it("refuses the publishable key with its own message", () => {
    expect(check("pk_live1234567890")).toEqual({
      shopLogoKey: "This is the publishable key. The server needs the secret key, which starts with sk_",
    });
  });

  it("refuses anything that is not a secret key", () => {
    for (const value of ["sk_", "sk_short", "ExampleKey12345", "sk_has space1234"]) {
      expect(check(value)).toEqual({ shopLogoKey: "A Logo.dev secret key starts with sk_" });
    }
  });
});
