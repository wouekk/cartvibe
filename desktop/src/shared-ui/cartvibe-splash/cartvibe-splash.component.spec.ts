import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { CartVibeSplashComponent } from "./cartvibe-splash.component";

describe("CartVibeSplashComponent", () => {
  let fixture: ComponentFixture<CartVibeSplashComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartVibeSplashComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CartVibeSplashComponent);
    await fixture.whenStable();
  });

  it("shows the animated banner and the loading text", () => {
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="cartvibe-splash-banner"]')?.getAttribute("src")).toBe("assets/brand/banner-wordmark-loading.svg");
    expect(el.textContent).toContain("Loading...");
  });

  it("shows the text it is given", async () => {
    fixture.componentRef.setInput("text", "Signing you in");
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Signing you in");
  });
});
