import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DemoFooterComponent } from "./demo-footer.component";

describe("DemoFooterComponent", () => {
  let fixture: ComponentFixture<DemoFooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoFooterComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DemoFooterComponent);
    await fixture.whenStable();
  });

  it("has the two lines of the project site's footer and nothing else", () => {
    const footer = fixture.nativeElement.querySelector('[data-testid="demo-footer"]') as HTMLElement;

    const lines = [...footer.querySelectorAll("p")].map((p) => p.textContent?.replace(/\s+/g, " ").trim());

    expect(lines).toEqual([
      "Free software under the GNU AGPL-3.0 · Upstream credits in NOTICE",
      "This site sets no cookies and runs no analytics or third-party scripts.",
    ]);
    expect(footer.querySelectorAll("p").length).toBe(2);
  });

  it("links the credits to NOTICE.md on GitHub, safely", () => {
    const link = fixture.nativeElement.querySelector('[data-testid="demo-footer-notice"]') as HTMLAnchorElement;

    expect(link.getAttribute("href")).toBe("https://github.com/wouekk/cartvibe/blob/main/NOTICE.md");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(fixture.nativeElement.querySelectorAll("a").length).toBe(1);
  });
});
