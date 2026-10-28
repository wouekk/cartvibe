import { TestBed } from "@angular/core/testing";
import { provideStore, Store } from "@ngxs/store";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetFeatureConfig } from "../../store/feature-config.state.actions";
import { ShopMonogramComponent, shopLogoUrl } from "./shop-monogram.component";
import { SHOP_BRANDS } from "./shop-brands";

describe("ShopMonogramComponent", () => {
  const known = SHOP_BRANDS[0];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideStore([FeatureConfigState])] });
  });

  const setKey = (shopLogoKey: string) =>
    TestBed.inject(Store).dispatch(new SetFeatureConfig({ enableLocalSignUp: false, aiPoweredReceipts: false, shopLogoKey }));

  const create = async (name: string | null | undefined) => {
    const fixture = TestBed.createComponent(ShopMonogramComponent);
    fixture.componentRef.setInput("name", name);
    await fixture.whenStable();
    return fixture;
  };

  const render = async (name: string | null | undefined): Promise<string> =>
    (await create(name)).nativeElement.textContent.trim();

  it("shows the first letter, upper-cased, for an unknown shop", async () => {
    setKey("pk_test123456789");
    expect(await render("zzz unknown shop")).toBe("Z");
    expect(await render("  édito corner")).toBe("É");
  });

  it("falls back to a question mark without a name", async () => {
    expect(await render("")).toBe("?");
    expect(await render(undefined)).toBe("?");
  });

  it("draws the letter white on black by day and black on white at night", async () => {
    const host: HTMLElement = (await create("zzz unknown shop")).nativeElement;

    expect(host.classList).toContain("bg-foreground");
    expect(host.classList).toContain("text-background");
  });

  it("shows only the letter for a known brand while no Logo.dev key is set", async () => {
    setKey("");
    const fixture = await create(known.name);

    expect(fixture.nativeElement.querySelector('[data-testid="shop-logo"]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe(known.name[0].toUpperCase());
  });

  it("loads a known brand's logo from Logo.dev with the key, on a white tile with a foreground ring", async () => {
    setKey("pk_test123456789");
    const fixture = await create(known.name);
    const image: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="shop-logo"]');

    expect(image.getAttribute("src")).toBe(shopLogoUrl(known.domain, "pk_test123456789"));
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(fixture.nativeElement.classList).toContain("bg-white");
    expect(fixture.nativeElement.classList).toContain("ring-foreground");
  });

  it("falls back to the letter when the logo fails to load", async () => {
    setKey("pk_test123456789");
    const fixture = await create(known.name);

    fixture.nativeElement.querySelector('[data-testid="shop-logo"]').dispatchEvent(new Event("error"));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="shop-logo"]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe(known.name[0].toUpperCase());
  });

  it("builds Logo.dev's image URL with the domain and key encoded", () => {
    expect(shopLogoUrl("carrefour.fr", "pk_abc")).toBe(
      "https://img.logo.dev/carrefour.fr?token=pk_abc&size=64&format=png&fallback=404"
    );
  });
});
