import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideZonelessChangeDetection } from "@angular/core";
import { CartVibeSplashComponent } from "./cartvibe-splash.component";

describe("CartVibeSplashComponent", () => {
  let fixture: ComponentFixture<CartVibeSplashComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CartVibeSplashComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(CartVibeSplashComponent);
  });

  it("shows the loader and the default text", async () => {
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector("app-cartvibe-loader")).toBeTruthy();
    expect(el.querySelector(".splash__text")?.textContent).toContain("Loading...");
  });

  it("shows the text it is given", async () => {
    fixture.componentRef.setInput("text", "Signing you in...");
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".splash__text")?.textContent).toContain("Signing you in...");
  });
});
