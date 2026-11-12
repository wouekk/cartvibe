import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { TabBarComponent, TabBarItem } from "./tab-bar.component";

const PAGES: TabBarItem[] = [
  { label: "Dashboard", icon: "lucideLayoutDashboard", link: ["/overview/group", 1], testId: "nav-overview" },
  { label: "Lists", icon: "lucideShoppingCart", link: ["/shopping-lists/group", 1], testId: "nav-shopping-lists" },
  { label: "Receipts", icon: "lucideReceiptText", link: ["/receipts/group", 1], testId: "nav-receipts" },
];

describe("TabBarComponent", () => {
  let fixture: ComponentFixture<TabBarComponent>;

  const slots = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll("[data-testid^=tab-]") as NodeListOf<HTMLElement>)
      .map((element) => element.getAttribute("data-testid") as string)
      .filter((testId) => testId !== "tab-bar");

  const byTestId = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid=${testId}]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabBarComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([{ path: "**", children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(TabBarComponent);
    fixture.componentRef.setInput("items", PAGES);
    fixture.componentRef.setInput("canScan", true);
    await fixture.whenStable();
  });

  it("shows the pages with Scan in the middle and More last", () => {
    expect(slots()).toEqual(["tab-nav-overview", "tab-nav-shopping-lists", "tab-scan", "tab-nav-receipts", "tab-more"]);
    expect(byTestId("tab-nav-shopping-lists").textContent).toContain("Lists");
    expect(byTestId("tab-bar").getAttribute("aria-label")).toBe("Main pages");
  });

  it("keeps Scan between the pages when the Dashboard is not offered", async () => {
    fixture.componentRef.setInput("items", PAGES.slice(1));
    await fixture.whenStable();

    expect(slots()).toEqual(["tab-nav-shopping-lists", "tab-scan", "tab-nav-receipts", "tab-more"]);
  });

  it("leaves Scan out for someone who may not scan", async () => {
    fixture.componentRef.setInput("canScan", false);
    await fixture.whenStable();

    expect(slots()).toEqual(["tab-nav-overview", "tab-nav-shopping-lists", "tab-nav-receipts", "tab-more"]);
  });

  it("marks the page being shown as the current one", async () => {
    await TestBed.inject(Router).navigateByUrl("/shopping-lists/group/1/list/7");
    await fixture.whenStable();

    expect(byTestId("tab-nav-shopping-lists").getAttribute("aria-current")).toBe("page");
    expect(byTestId("tab-nav-receipts").getAttribute("aria-current")).toBeNull();
  });

  it("draws how many scans still wait on this device on Scan, and says it", async () => {
    expect(byTestId("tab-scan-waiting")).toBeNull();
    expect(byTestId("tab-scan").getAttribute("aria-label")).toBeNull();

    fixture.componentRef.setInput("waiting", 2);
    await fixture.whenStable();

    expect(byTestId("tab-scan-waiting").textContent?.trim()).toBe("2");
    expect(byTestId("tab-scan").getAttribute("aria-label")).toBe("Scan, 2 waiting to upload");
  });

  it("asks the shell to scan and to open the rest of the navigation", () => {
    const scan = vi.fn();
    const more = vi.fn();
    fixture.componentInstance.scan.subscribe(scan);
    fixture.componentInstance.more.subscribe(more);

    byTestId("tab-scan").click();
    byTestId("tab-more").click();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(more).toHaveBeenCalledTimes(1);
  });

  it("steps aside while a text field has the focus, and not for a checkbox", async () => {
    const text = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.append(text, checkbox);
    const hidden = () => (fixture.nativeElement as HTMLElement).getAttribute("data-state") === "hidden";

    try {
      text.focus();
      await fixture.whenStable();
      expect(hidden()).toBe(true);

      checkbox.focus();
      await fixture.whenStable();
      expect(hidden()).toBe(false);

      text.focus();
      text.blur();
      await fixture.whenStable();
      expect(hidden()).toBe(false);
    } finally {
      text.remove();
      checkbox.remove();
    }
  });
});
