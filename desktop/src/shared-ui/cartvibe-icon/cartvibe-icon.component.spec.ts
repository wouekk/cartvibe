import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CartVibeIconComponent } from "./cartvibe-icon.component";

describe("CartVibeIconComponent", () => {
  let fixture: ComponentFixture<CartVibeIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartVibeIconComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CartVibeIconComponent);
    await fixture.whenStable();
  });

  it("draws the square, three bars, the arrow, the cart and two wheels", () => {
    const svg: SVGElement = fixture.nativeElement.querySelector("svg");

    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.querySelectorAll("rect[fill='url(#cv-bars)']").length).toBe(3);
    expect(svg.querySelectorAll("circle").length).toBe(2);
    expect(svg.querySelector("path[fill='var(--cv-arrow)']")).not.toBeNull();
    expect(svg.querySelector("path[fill='var(--cv-cart)']")).not.toBeNull();
  });

  it("takes its colors from variables, so the dark drawing can swap them, and never from the accent", () => {
    const html = fixture.nativeElement.innerHTML as string;

    expect(html).toContain("var(--cv-bg-a)");
    expect(html).toContain("var(--cv-cart)");
    expect(html).not.toContain("--accent");
  });

  it("can be any size", async () => {
    fixture.componentRef.setInput("size", 96);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("svg").getAttribute("height")).toBe("96");
  });
});
