import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { SystemSettingsService } from "../../open-api";
import { SnackbarService } from "../../services";
import { LogsPageComponent } from "./logs-page.component";

import type { Mock } from "vitest";
describe("LogsPageComponent", () => {
  let fixture: ComponentFixture<LogsPageComponent>;
  let component: LogsPageComponent;
  let systemSettingsService: { getAppLog: Mock };
  let snackbar: { error: Mock };

  const entries = [
    { timestamp: "2026/10/20 10:00:02", level: "INFO", message: "done" },
    { timestamp: "2026/10/20 10:00:01", level: "ERROR", message: "boom" },
  ];

  const setUp = async (getAppLog: Mock): Promise<void> => {
    systemSettingsService = { getAppLog };
    snackbar = { error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LogsPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SystemSettingsService, useValue: systemSettingsService },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LogsPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  it("loads the newest entries and renders them with errors marked", async () => {
    await setUp(vi.fn(() => of(entries)));

    expect(systemSettingsService.getAppLog).toHaveBeenCalledWith(undefined, 300);
    const rows = fixture.nativeElement.querySelectorAll(".entry");
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain("done");
    expect(rows[1].classList).toContain("error");
  });

  it("asks for one level when a filter is picked", async () => {
    await setUp(vi.fn(() => of(entries)));

    component.selectLevel("ERROR");

    expect(systemSettingsService.getAppLog).toHaveBeenLastCalledWith("ERROR", 300);
    expect(component.level()).toBe("ERROR");
  });

  it("says so when the log is empty", async () => {
    await setUp(vi.fn(() => of([])));

    expect(fixture.nativeElement.querySelector("[data-testid=log-empty]")).not.toBeNull();
  });

  it("reports a failed load and stops the spinner", async () => {
    await setUp(vi.fn(() => throwError(() => new Error("boom"))));

    expect(snackbar.error).toHaveBeenCalledWith("Could not load the log");
    expect(component.loading()).toBe(false);
  });
});
