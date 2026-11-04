import { Component, provideZonelessChangeDetection, signal, viewChild } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ExpansionPanelComponent } from "./expansion-panel.component";

@Component({
  selector: "app-expansion-panel-host",
  standalone: true,
  imports: [ExpansionPanelComponent],
  template: `
    <app-expansion-panel [expanded]="startOpen()" [hideToggle]="hideToggle()" (opened)="events.push('opened')" (closed)="events.push('closed')">
      <span panelTitle>Advanced</span>
      <span panelDescription>3 settings</span>
      <p data-testid="panel-content">Body text</p>
    </app-expansion-panel>
  `,
})
class ExpansionPanelHostComponent {
  public readonly startOpen = signal(false);
  public readonly hideToggle = signal(false);
  public readonly events: string[] = [];
  public readonly panel = viewChild.required(ExpansionPanelComponent);
}

describe("ExpansionPanelComponent", () => {
  let fixture: ComponentFixture<ExpansionPanelHostComponent>;
  let host: ExpansionPanelHostComponent;

  const header = (): HTMLButtonElement => fixture.nativeElement.querySelector('[data-testid="expansion-header"]');
  const content = (): HTMLElement | null => fixture.nativeElement.querySelector('[data-testid="panel-content"]');

  const create = async (startOpen = false, hideToggle = false) => {
    await TestBed.configureTestingModule({
      imports: [ExpansionPanelHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(ExpansionPanelHostComponent);
    host = fixture.componentInstance;
    host.startOpen.set(startOpen);
    host.hideToggle.set(hideToggle);
    await fixture.whenStable();
  };

  it("shows the projected title and description in a collapsed header", async () => {
    await create();

    expect(header().textContent).toContain("Advanced");
    expect(header().textContent).toContain("3 settings");
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(content()).toBeNull();
  });

  it("opens and closes on a click, telling the host each time", async () => {
    await create();

    header().click();
    await fixture.whenStable();
    expect(header().getAttribute("aria-expanded")).toBe("true");
    expect(content()?.textContent).toBe("Body text");
    expect(host.panel().expanded).toBe(true);

    header().click();
    await fixture.whenStable();
    expect(header().getAttribute("aria-expanded")).toBe("false");
    expect(content()).toBeNull();
    expect(host.events).toEqual(["opened", "closed"]);
  });

  it("starts open when asked, and open() on an open panel emits nothing", async () => {
    await create(true);
    expect(header().getAttribute("aria-expanded")).toBe("true");
    expect(content()).not.toBeNull();

    host.panel().open();
    expect(host.events).toEqual([]);

    host.panel().close();
    host.panel().close();
    await fixture.whenStable();
    expect(host.events).toEqual(["closed"]);
    expect(content()).toBeNull();
  });

  it("keeps a person's choice when the starting state changes later", async () => {
    await create();
    header().click();
    await fixture.whenStable();

    host.startOpen.set(false);
    await fixture.whenStable();

    expect(header().getAttribute("aria-expanded")).toBe("true");
  });

  it("can hide the chevron without losing the toggle", async () => {
    await create(false, true);

    expect(header().querySelector("app-icon")).toBeNull();
    header().click();
    await fixture.whenStable();
    expect(content()).not.toBeNull();
  });
});
