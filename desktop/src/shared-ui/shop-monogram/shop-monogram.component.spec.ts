import { TestBed } from "@angular/core/testing";
import { ShopMonogramComponent } from "./shop-monogram.component";
import { SHOP_LOGOS } from "./shop-logos.generated";

describe("ShopMonogramComponent", () => {
  const create = async (name: string | null | undefined) => {
    const fixture = TestBed.createComponent(ShopMonogramComponent);
    fixture.componentRef.setInput("name", name);
    await fixture.whenStable();
    return fixture;
  };

  const render = async (name: string | null | undefined): Promise<string> =>
    (await create(name)).nativeElement.textContent.trim();

  it("shows the first letter, upper-cased, for an unknown shop", async () => {
    expect(await render("zzz unknown shop")).toBe("Z");
    expect(await render("  édito corner")).toBe("É");
  });

  it("falls back to a question mark without a name", async () => {
    expect(await render("")).toBe("?");
    expect(await render(undefined)).toBe("?");
  });

  it("draws the letter white on black on the White theme and black on white on Black", async () => {
    const host: HTMLElement = (await create("zzz unknown shop")).nativeElement;

    expect(host.classList).toContain("bg-foreground");
    expect(host.classList).toContain("text-background");
  });

  it("shows the logo of a known shop on a white tile with a foreground ring", async () => {
    const known = SHOP_LOGOS[0];
    const fixture = await create(known.name);
    const image: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="shop-logo"]');

    expect(image.getAttribute("src")).toBe(`assets/shops/${known.slug}.png`);
    expect(fixture.nativeElement.classList).toContain("bg-white");
    expect(fixture.nativeElement.classList).toContain("ring-foreground");
  });

  it("falls back to the letter when the logo file fails to load", async () => {
    const known = SHOP_LOGOS[0];
    const fixture = await create(known.name);

    fixture.nativeElement.querySelector('[data-testid="shop-logo"]').dispatchEvent(new Event("error"));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="shop-logo"]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe(known.name[0].toUpperCase());
  });
});
