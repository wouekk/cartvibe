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

  it("is the supplied lockup: the icon and the CartVibe wordmark on a 430 by 120 canvas", () => {
    const svg: SVGElement = fixture.nativeElement.querySelector("svg");

    expect(svg.getAttribute("viewBox")).toBe("0 0 430 120");
    expect(svg.getAttribute("aria-label")).toBe("CartVibe");
    const tspans = svg.querySelectorAll("tspan");
    expect(tspans[0].textContent).toBe("Cart");
    expect(tspans[1].textContent).toBe("Vibe");
    expect(svg.querySelectorAll("rect").length).toBe(4);
    expect(svg.querySelectorAll("circle").length).toBe(2);
  });

  it("keeps the supplied palette: purple badge, never the accent", () => {
    const html = fixture.nativeElement.innerHTML as string;

    expect(html).toContain("var(--logo-bg-bl)");
    expect(html).toContain("var(--logo-text-vibe)");
    expect(html).not.toContain("--accent");
  });

  it("scales by height, keeping the artwork's proportions", async () => {
    fixture.componentRef.setInput("height", 60);
    await fixture.whenStable();

    const svg: SVGElement = fixture.nativeElement.querySelector("svg");
    expect(svg.getAttribute("height")).toBe("60");
    expect(svg.getAttribute("width")).toBe("215");
  });
});
