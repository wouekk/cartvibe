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

  it("is the icon beside the CartVibe wordmark", () => {
    const el: HTMLElement = fixture.nativeElement;
    const wordmark = el.querySelector('[data-testid="cartvibe-logo"]') as HTMLElement;

    expect(el.querySelector("app-cartvibe-icon")).not.toBeNull();
    expect(wordmark.getAttribute("aria-label")).toBe("CartVibe");
    expect(wordmark.querySelector(".cart")?.textContent).toBe("Cart");
    expect(wordmark.querySelector(".vibe")?.textContent).toBe("Vibe");
  });

  it("sizes the icon by height and the wordmark from it, large", async () => {
    fixture.componentRef.setInput("height", 60);
    await fixture.whenStable();

    const icon = fixture.nativeElement.querySelector("svg");
    const wordmark = fixture.nativeElement.querySelector('[data-testid="cartvibe-logo"]') as HTMLElement;
    expect(icon.getAttribute("height")).toBe("60");
    expect(wordmark.style.fontSize).toBe("49px");
  });
});
