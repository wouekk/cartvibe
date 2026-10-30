import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideStore, Store } from "@ngxs/store";


import { AboutComponent } from "./about.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { AboutState } from "../../store/about.state";
import { FeatureConfigState } from "../../store/feature-config.state";
import { SetFeatureConfig } from "../../store/feature-config.state.actions";

describe("AboutComponent", () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;

  beforeEach(async () => {

    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideStore([AboutState, FeatureConfigState])
      ]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AboutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("credits the original project, Logo.dev and Open Food Facts with links", () => {
    const element: HTMLElement = fixture.nativeElement;
    const href = (testId: string) =>
      element.querySelector(`[data-testid="${testId}"] a`)?.getAttribute("href");

    expect(href("about-credits")).toBe("https://github.com/Receipt-Wrangler/receipt-wrangler");
    expect(href("about-credits-logos")).toBe("https://logo.dev");
    expect(href("about-credits-product-data")).toBe("https://world.openfoodfacts.org");
  });

  it("credits the font, icons, UI sources and charts and links the licence texts", () => {
    const element: HTMLElement = fixture.nativeElement;
    const hrefs = (testId: string) =>
      Array.from(element.querySelectorAll(`[data-testid="${testId}"] a`)).map((a) => a.getAttribute("href"));

    expect(hrefs("about-credits-libraries")).toEqual([
      "https://github.com/vercel/geist-font",
      "https://lucide.dev",
      "https://github.com/spartan-ng/spartan",
      "https://www.chartjs.org",
    ]);
    expect(hrefs("about-credits-licences")).toEqual(["/3rdpartylicenses.txt", "/assets/licenses/NOTICES.txt"]);
  });


});
