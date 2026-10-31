import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DemoBannerComponent } from "./demo-banner.component";
import { DemoSession } from "./demo-session";

describe("DemoBannerComponent", () => {
  let fixture: ComponentFixture<DemoBannerComponent>;
  const session = { reset: vi.fn() };

  beforeEach(async () => {
    session.reset.mockClear();
    await TestBed.configureTestingModule({
      imports: [DemoBannerComponent],
      providers: [provideZonelessChangeDetection(), { provide: DemoSession, useValue: session }],
    }).compileComponents();

    fixture = TestBed.createComponent(DemoBannerComponent);
    await fixture.whenStable();
  });

  it("says nothing is saved", () => {
    const banner = fixture.nativeElement.querySelector('[data-testid="demo-banner"]') as HTMLElement;

    expect(banner.textContent).toContain("Demo, nothing is saved");
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("offers a way back to the project page", () => {
    const link = fixture.nativeElement.querySelector('[data-testid="demo-home"]') as HTMLAnchorElement;

    expect(link.getAttribute("href")).toBe("../");
  });

  it("resets the demo on a press of Reset", () => {
    (fixture.nativeElement.querySelector('[data-testid="demo-reset"]') as HTMLButtonElement).click();

    expect(session.reset).toHaveBeenCalledTimes(1);
  });
});
