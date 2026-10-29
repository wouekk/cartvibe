import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ShopLogoCatalog } from "./shop-logo-catalog.service";
import { buildCandidates, Candidate, ShopBrand } from "./shop-logo-match";
import { ShopMonogramComponent } from "./shop-monogram.component";

describe("ShopMonogramComponent", () => {
  const lidl: ShopBrand = { slug: "lidl", name: "Lidl", aliases: [] };
  const candidates = signal<Candidate[]>([]);

  beforeEach(() => {
    candidates.set([]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ShopLogoCatalog,
          useValue: { candidates, logoUrl: (slug: string) => `/api/shopLogo/${slug}` },
        },
      ],
    });
  });

  const create = async (name: string | null | undefined) => {
    const fixture = TestBed.createComponent(ShopMonogramComponent);
    fixture.componentRef.setInput("name", name);
    await fixture.whenStable();
    return fixture;
  };

  const render = async (name: string | null | undefined): Promise<string> =>
    (await create(name)).nativeElement.textContent.trim();

  it("shows the first letter, upper-cased, for an unknown shop", async () => {
    candidates.set(buildCandidates([lidl]));
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

  it("shows only the letter while the server has no logos (no Logo.dev key)", async () => {
    const fixture = await create("Lidl");

    expect(fixture.nativeElement.querySelector('[data-testid="shop-logo"]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe("L");
  });

  it("loads a downloaded logo from this server, on a white tile with a foreground ring", async () => {
    candidates.set(buildCandidates([lidl]));
    const fixture = await create("LIDL Polska sp. z o.o.");
    const image: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="shop-logo"]');

    expect(image.getAttribute("src")).toBe("/api/shopLogo/lidl");
    expect(fixture.nativeElement.classList).toContain("bg-white");
    expect(fixture.nativeElement.classList).toContain("ring-foreground");
  });

  it("falls back to the letter when the logo fails to load", async () => {
    candidates.set(buildCandidates([lidl]));
    const fixture = await create("Lidl");

    fixture.nativeElement.querySelector('[data-testid="shop-logo"]').dispatchEvent(new Event("error"));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[data-testid="shop-logo"]')).toBeNull();
    expect(fixture.nativeElement.textContent.trim()).toBe("L");
  });
});
