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
    expect(element.querySelector(".logo__cart")?.textContent).toBe("Cart");
    expect(element.querySelector(".logo__vibe")?.textContent).toBe("Vibe");
  });

  it("colors the icon gradient from the accent variables, so a new accent recolors it", () => {
    const stops = fixture.nativeElement.querySelectorAll("#cv-squircle-grad stop");

    expect(stops[0].getAttribute("stop-color")).toContain("var(--accent-color");
    expect(stops[1].getAttribute("stop-color")).toContain("var(--accent-hover");
  });

  it("can show the icon alone and at another size", async () => {
    fixture.componentRef.setInput("showWordmark", false);
    fixture.componentRef.setInput("iconSize", 44);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".logo__word")).toBeNull();
    expect(fixture.nativeElement.querySelector("svg").getAttribute("width")).toBe("44");
  });
});
