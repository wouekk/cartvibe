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

  it.each(["dark", "light"])("draws the supplied %s icon: a squircle, three bars, the arrow, the cart and two wheels", (variant) => {
    const svg: SVGElement = fixture.nativeElement.querySelector(`[data-testid="cartvibe-icon-${variant}"]`);

    expect(svg.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(svg.querySelector("rect[rx='115']")).not.toBeNull();
    expect(svg.querySelectorAll("g rect").length).toBe(3);
    expect(svg.querySelectorAll("circle").length).toBe(2);
    expect(svg.querySelectorAll("path").length).toBe(4);
  });

  it("keeps the emerald bars and the blue arrow of the files in both versions", () => {
    const html = fixture.nativeElement.innerHTML as string;

    expect(html.match(/#19E68C/gi)?.length).toBe(2);
    expect(html.match(/#0D6EFD/gi)?.length).toBe(2);
    expect(html).not.toContain("--accent");
  });

  it("scales to the requested size", async () => {
    fixture.componentRef.setInput("size", 96);
    await fixture.whenStable();

    const svg: SVGElement = fixture.nativeElement.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("96");
    expect(svg.getAttribute("height")).toBe("96");
  });
});
