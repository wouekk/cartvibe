import { TestBed } from "@angular/core/testing";
import { ShopMonogramComponent } from "./shop-monogram.component";

describe("ShopMonogramComponent", () => {
  const render = async (name: string | null | undefined): Promise<string> => {
    const fixture = TestBed.createComponent(ShopMonogramComponent);
    fixture.componentRef.setInput("name", name);
    await fixture.whenStable();
    return fixture.nativeElement.textContent.trim();
  };

  it("shows the first letter, upper-cased", async () => {
    expect(await render("aldi")).toBe("A");
    expect(await render("  édeka")).toBe("É");
  });

  it("falls back to a question mark without a name", async () => {
    expect(await render("")).toBe("?");
    expect(await render(undefined)).toBe("?");
  });
});
