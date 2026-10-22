import { FormMode } from "src/enums/form-mode.enum";
import { setEntityHeaderText } from "./form.utils";

describe("setEntityHeaderText", () => {
  const entity = { name: "Home" };

  it("words the header per mode, with the entity type when there is one", () => {
    expect(setEntityHeaderText(entity, "name", { mode: FormMode.view } as never)).toBe("View Home");
    expect(setEntityHeaderText(entity, "name", { mode: FormMode.edit } as never, "Receipt Settings")).toBe("Edit Home Receipt Settings");
    expect(setEntityHeaderText(entity, "name", { mode: FormMode.add } as never)).toBe("Create Home");
  });

  it("hands the key and the translated type to the translator", () => {
    const translate = jest.fn((text: string, params?: Record<string, string | number | null | undefined>) =>
      text === "Receipt Settings" ? "Ustawienia paragonów" : `${text}|${params?.["name"]}|${params?.["type"]}`
    );

    expect(setEntityHeaderText(entity, "name", { mode: FormMode.view } as never, "Receipt Settings", translate)).toBe(
      "View {name} {type}|Home|Ustawienia paragonów"
    );
  });

  it("is empty without an entity name", () => {
    expect(setEntityHeaderText({}, "name", { mode: FormMode.view } as never)).toBe("");
  });
});
