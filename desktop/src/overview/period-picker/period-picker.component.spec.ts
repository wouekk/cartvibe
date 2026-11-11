import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NgxsModule, Store } from "@ngxs/store";
import { todayInZone } from "../../utils/app-time-zone";
import { toDayKey } from "../overview-period";
import { PeriodPickerComponent } from "./period-picker.component";
import { SystemSettingsStore } from "../../store/system-settings.store";

describe("PeriodPickerComponent", () => {
  let fixture: ComponentFixture<PeriodPickerComponent>;
  let component: PeriodPickerComponent;
  let emitted: unknown[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodPickerComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PeriodPickerComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.periodChange.subscribe((period) => emitted.push(period));
    await fixture.whenStable();
  });

  const today = () => todayInZone(TestBed.inject(SystemSettingsStore).timeZone());

  it("offers exactly this month, last 7 days, last 30 days, this year and custom", () => {
    expect(component.periodTabs.map((tab) => tab.label)).toEqual([
      "This month",
      "Last 7 days",
      "Last 30 days",
      "This year",
      "Custom",
    ]);
  });

  it("starts on this month and emits it", () => {
    const now = today();
    const last = emitted[emitted.length - 1] as { from: string; to: string };

    expect(last.from).toBe(toDayKey(new Date(now.getFullYear(), now.getMonth(), 1)));
    expect(last.to).toBe(toDayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  });

  // On a phone the strip names the period; the two fields are drawn for a custom range only.
  it("marks From and To as hidden on a phone until the range is custom", async () => {
    const range: HTMLElement = fixture.nativeElement.querySelector('[data-testid="overview-custom-range"]');
    expect(range.classList.contains("max-md:hidden")).toBe(true);

    component.selectPeriod("CUSTOM");
    await fixture.whenStable();

    expect(range.classList.contains("max-md:hidden")).toBe(false);
    expect(component.fromText()).not.toBe("");
  });

  it("shows the period in From and To and turns custom when one is typed", async () => {
    component.selectPeriod("THIS_YEAR");
    await fixture.whenStable();
    const year = today().getFullYear();
    expect(component.fromText()).toBe(`01/01/${year}`);
    expect(component.toText()).toBe(`31/12/${year}`);

    const input = document.createElement("input");
    input.value = "15/03/2025";
    component.typeDay("from", { target: input } as unknown as Event);
    await fixture.whenStable();

    expect(component.preset()).toBe("CUSTOM");
    expect(component.fromText()).toBe("15/03/2025");
    expect(component.toText()).toBe(`31/12/${year}`);
    expect(emitted[emitted.length - 1]).toMatchObject({ from: "2025-03-15", to: `${year}-12-31` });
  });

  it("takes a day from the calendar picker as DD/MM/YYYY", async () => {
    const input = document.createElement("input");
    input.type = "date";
    input.value = "2026-04-09";
    component.pickDay("to", { target: input } as unknown as Event);
    await fixture.whenStable();

    expect(component.toText()).toBe("09/04/2026");
  });

  it("emits nothing usable for an incomplete custom range", async () => {
    component.selectPeriod("CUSTOM");
    const empty = document.createElement("input");
    empty.value = "";
    component.typeDay("to", { target: empty } as unknown as Event);
    await fixture.whenStable();

    expect(emitted[emitted.length - 1]).toBeUndefined();
  });
});

describe("PeriodPickerComponent with a starting range", () => {
  it("opens on that range as a custom one and emits it, never this month first", async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodPickerComponent, NgxsModule.forRoot([])],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(PeriodPickerComponent);
    const emitted: unknown[] = [];
    fixture.componentInstance.periodChange.subscribe((period) => emitted.push(period));
    fixture.componentRef.setInput("initial", { from: "2026-09-01", to: "2026-09-30" });
    await fixture.whenStable();

    expect(fixture.componentInstance.preset()).toBe("CUSTOM");
    expect(fixture.componentInstance.fromText()).toBe("01/09/2026");
    expect(fixture.componentInstance.toText()).toBe("30/09/2026");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });
});
