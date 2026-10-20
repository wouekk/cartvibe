import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CartVibeLogoComponent } from "./cartvibe-logo.component";

describe("CartVibeLogoComponent", () => {
  let fixture: ComponentFixture<CartVibeLogoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartVibeLogoComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CartVibeLogoComponent);
    await fixture.whenStable();
  });

  it("shows the icon and the CartVibe wordmark", () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector("svg")).not.toBeNull();
    expect(element.querySelector(".cv-wordmark-cart")?.textContent).toBe("Cart");
    expect(element.querySelector(".logo__vibe")?.textContent).toBe("Vibe");
  });

  it("keeps the brand purple: the icon never follows the accent", () => {
    const html = fixture.nativeElement.innerHTML as string;

    expect(html).toContain("var(--cv-bg-a)");
    expect(html).not.toContain("--accent");
  });

  it("can show the icon alone and at another size", async () => {
    fixture.componentRef.setInput("showWordmark", false);
    fixture.componentRef.setInput("iconSize", 48);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".logo__word")).toBeNull();
    expect(fixture.nativeElement.querySelector("svg").getAttribute("width")).toBe("48");
  });
});
