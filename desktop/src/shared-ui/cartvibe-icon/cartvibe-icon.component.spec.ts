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

  it("is the supplied icon: a squircle, three bars, the arrow, the cart and two wheels", () => {
    const svg: SVGElement = fixture.nativeElement.querySelector("svg");

    expect(svg.getAttribute("viewBox")).toBe("0 0 120 120");
    expect(svg.querySelector("rect[rx='28']")).not.toBeNull();
    expect(svg.querySelectorAll("g rect").length).toBe(3);
    expect(svg.querySelectorAll("circle").length).toBe(2);
    expect(svg.querySelectorAll("path").length).toBe(2);
  });

  it("takes its palette from variables, and never from the accent", () => {
    const html = fixture.nativeElement.innerHTML as string;

    expect(html).toContain("var(--bg-bl)");
    expect(html).toContain("var(--cart-fill)");
    expect(html).not.toContain("--accent");
  });

  it("can be any size", async () => {
    fixture.componentRef.setInput("size", 96);
    await fixture.whenStable();

    const svg: SVGElement = fixture.nativeElement.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("96");
    expect(svg.getAttribute("height")).toBe("96");
  });
});
