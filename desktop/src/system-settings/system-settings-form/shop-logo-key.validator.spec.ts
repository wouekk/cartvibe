import { FormControl } from "@angular/forms";
import { shopLogoKeyValidator } from "./system-settings-form.component";

describe("shopLogoKeyValidator", () => {
  const check = (value: unknown) => shopLogoKeyValidator()(new FormControl(value));

  it("accepts an empty field (logos off) and a publishable key", () => {
    expect(check("")).toBeNull();
    expect(check(null)).toBeNull();
    expect(check("pk_ExampleKey12345")).toBeNull();
    expect(check("  pk_abc-DEF_12345  ")).toBeNull();
  });

  it("refuses a secret key with its own message", () => {
    expect(check("sk_live1234567890")).toEqual({
      shopLogoKey: "This is a secret key. Use the publishable key, which starts with pk_",
    });
  });

  it("refuses anything that is not a publishable key", () => {
    for (const value of ["pk_", "pk_short", "ExampleKey12345", "pk_has space1234"]) {
      expect(check(value)).toEqual({ shopLogoKey: "A Logo.dev publishable key starts with pk_" });
    }
  });
});
