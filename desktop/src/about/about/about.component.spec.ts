import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";


import { AboutComponent } from "./about.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { Permission } from "../../open-api";
import { AboutStore } from "../../store/about.store";
import { AuthStore } from "../../store/auth.store";

describe("AboutComponent", () => {
  let component: AboutComponent;
  let fixture: ComponentFixture<AboutComponent>;

  beforeEach(async () => {

    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
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
    expect(hrefs("about-credits-licences")).toEqual(["3rdpartylicenses.txt", "assets/licenses/NOTICES.txt"]);
  });

  // docker/entrypoint.sh: ALLOW_ROOT=1 runs the API as root when its folders refuse the unprivileged user.
  describe("a server that runs as root", () => {
    const warning = (): HTMLElement | null => fixture.nativeElement.querySelector('[data-testid="about-runs-as-root"]');
    const set = async (runsAsRoot: boolean, appPermissions: string[]): Promise<void> => {
      TestBed.inject(AboutStore).setAbout({ version: "v0.19.0", buildDate: "unknown", runsAsRoot });
      TestBed.inject(AuthStore).setPermissions(appPermissions, {});
      await fixture.whenStable();
    };

    it("tells the person who can change the server's settings", async () => {
      await set(true, [Permission.AppSystemSettingsUpdate]);

      expect(warning()?.textContent).toContain("The server runs as root");
    });

    it("says nothing to anyone else", async () => {
      await set(true, []);

      expect(warning()).toBeNull();
    });

    it("says nothing when the server is unprivileged", async () => {
      await set(false, [Permission.AppSystemSettingsUpdate]);

      expect(warning()).toBeNull();
    });
  });

});
