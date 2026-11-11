import { ApplicationRef, ComponentRef, EnvironmentInjector, createComponent, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ReportsModule } from "../reports.module";
import { ReportSectionComponent } from "./report-section.component";

// The section is declared (not exported) by ReportsModule, so it is created directly with projected nodes, as a
// parent template would project them: [sectionActions] first, then the body.
describe("ReportSectionComponent", () => {
  let ref: ComponentRef<ReportSectionComponent>;
  let element: HTMLElement;

  const node = (html: string): Node => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.content.firstElementChild!;
  };

  const settle = async () => {
    ref.changeDetectorRef.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsModule],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();

    ref = createComponent(ReportSectionComponent, {
      environmentInjector: TestBed.inject(EnvironmentInjector),
      projectableNodes: [
        [node('<button type="button" data-testid="section-add">Add</button>')],
        [node('<p data-testid="section-body">Rows go here</p>')],
      ],
    });
    ref.setInput("icon", "filter_list");
    ref.setInput("headerText", "Filters");
    ref.setInput("subtitle", "Narrow the receipts down");
    element = ref.location.nativeElement;
    await settle();
  });

  afterEach(() => ref.destroy());

  it("is a titled section with its description, actions in the header and the body below", () => {
    const header = element.querySelector("section header")!;

    expect(header.querySelector("h3")?.textContent).toBe("Filters");
    expect(header.textContent).toContain("Narrow the receipts down");
    expect(header.querySelector("[data-testid='section-add']")).not.toBeNull();
    expect(header.querySelector("[data-testid='section-body']")).toBeNull();
    expect(element.querySelector("section [data-testid='section-body']")?.textContent).toBe("Rows go here");
  });

  it("draws its icon, hidden from screen readers", () => {
    const tile = element.querySelector("header [aria-hidden='true']");

    expect(tile?.querySelector("svg")).not.toBeNull();
  });

  it("leaves out the description line when there is none, and follows a new title", async () => {
    ref.setInput("subtitle", "");
    ref.setInput("headerText", "Columns");
    await settle();

    const header = element.querySelector("header")!;
    expect(header.querySelector("h3")?.textContent).toBe("Columns");
    expect(header.querySelector("p")).toBeNull();
  });
});
