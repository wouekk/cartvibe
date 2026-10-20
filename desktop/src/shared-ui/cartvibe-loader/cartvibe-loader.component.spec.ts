import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CartVibeLoaderComponent } from "./cartvibe-loader.component";

describe("CartVibeLoaderComponent", () => {
  let fixture: ComponentFixture<CartVibeLoaderComponent>;

  const loader = (): SVGElement => fixture.nativeElement.querySelector("[data-testid=cartvibe-loader]");

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartVibeLoaderComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CartVibeLoaderComponent);
    await fixture.whenStable();
  });

  it("is the badge loader by default: on the purple square, announced as a loading status", () => {
    expect(loader().getAttribute("role")).toBe("status");
    expect(loader().getAttribute("aria-label")).toBe("Loading");
    expect(loader().getAttribute("viewBox")).toBe("0 0 120 120");
    expect(loader().querySelector("rect[rx='28']")).not.toBeNull();
    expect(loader().querySelectorAll(".cv-bar").length).toBe(3);
    expect(loader().querySelector(".cv-arrow-clip")).not.toBeNull();
    expect(loader().querySelector(".cv-cart-wrap")).not.toBeNull();
  });

  it("is the transparent loader on request: no square, the cart in the text color", async () => {
    fixture.componentRef.setInput("variant", "transparent");
    await fixture.whenStable();

    expect(loader().getAttribute("viewBox")).toBe("12 15 86 84");
    expect(loader().querySelector("rect[rx='28']")).toBeNull();
    expect(loader().querySelectorAll(".cv-bar-t").length).toBe(3);
    expect(loader().querySelector("path[fill='currentColor']")).not.toBeNull();
  });

  it("is sized by its input", async () => {
    fixture.componentRef.setInput("size", 120);
    await fixture.whenStable();

    expect(loader().getAttribute("width")).toBe("120");
    expect(loader().getAttribute("height")).toBe("120");
  });
});
