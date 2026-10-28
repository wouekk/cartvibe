import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { PaletteSwatchComponent } from "./palette-swatch.component";

describe("PaletteSwatchComponent", () => {
  it("carries its palette on the host, so that palette's tokens apply to it", async () => {
    await TestBed.configureTestingModule({
      imports: [PaletteSwatchComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(PaletteSwatchComponent);

    fixture.componentRef.setInput("palette", "emerald");
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.getAttribute("data-palette")).toBe("emerald");
    expect(host.getAttribute("aria-hidden")).toBe("true");

    fixture.componentRef.setInput("palette", "violet");
    await fixture.whenStable();

    expect(host.getAttribute("data-palette")).toBe("violet");
  });
});
