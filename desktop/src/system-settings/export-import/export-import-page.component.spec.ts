import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { Store } from "@ngxs/store";
import { BackupService, BackupSummary } from "../../open-api";
import { SnackbarService } from "../../services";
import { formatByteSize } from "../../utils/file";
import { ExportImportPageComponent, exportDownloadUrl } from "./export-import-page.component";

import type { Mock } from "vitest";

describe("ExportImportPageComponent", () => {
  let fixture: ComponentFixture<ExportImportPageComponent>;
  let component: ExportImportPageComponent;
  let backupService: { getBackupSummary: Mock };
  let snackbar: { error: Mock };

  const summary: BackupSummary = {
    counts: [
      { name: "receipts", count: 12 },
      { name: "receipt_products", count: 87 },
      { name: "users", count: 2 },
    ],
    fileCount: 9,
    fileBytes: 3 * 1024 * 1024,
    formatVersion: 2,
  };

  const setUp = async (getBackupSummary: Mock): Promise<void> => {
    backupService = { getBackupSummary };
    snackbar = { error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ExportImportPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        // No import permission: the Import card stays out of these specs.
        { provide: Store, useValue: { selectSnapshot: () => false } },
        { provide: BackupService, useValue: backupService },
        { provide: SnackbarService, useValue: snackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportImportPageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  const text = (testId: string): string =>
    fixture.nativeElement.querySelector(`[data-testid=${testId}]`)?.textContent.trim() ?? "";

  it("shows what the export would hold and the size of the photos", async () => {
    await setUp(vi.fn(() => of(summary)));

    const counts = Array.from(fixture.nativeElement.querySelectorAll("[data-testid=export-count]")).map((cell) =>
      (cell as HTMLElement).textContent?.trim()
    );
    expect(counts.slice(0, 2)).toEqual(["12", "87"]);
    expect(text("export-file-size")).toContain("9 files, 3.0 MB.");
    expect(fixture.nativeElement.querySelector("[data-testid=export-download]").disabled).toBe(false);
  });

  it("renews the session, then downloads with or without the photos", async () => {
    await setUp(vi.fn(() => of(summary)));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const hrefs: string[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.getAttribute("href") ?? "");
    });

    component.download();
    component.includeFiles.set(false);
    component.download();
    await fixture.whenStable();

    expect(backupService.getBackupSummary).toHaveBeenCalledTimes(3);
    expect(hrefs).toEqual([exportDownloadUrl(true), exportDownloadUrl(false)]);
    expect(hrefs[1]).toBe("/api/backup/export?includeFiles=false");
    expect(text("export-status")).toContain("The download has started");
    click.mockRestore();
  });

  it("says so when the export cannot start, and lets the person try again", async () => {
    let calls = 0;
    await setUp(vi.fn(() => (calls++ === 0 ? of(summary) : throwError(() => new Error("offline")))));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    component.download();
    await fixture.whenStable();

    expect(click).not.toHaveBeenCalled();
    expect(snackbar.error).toHaveBeenCalledWith("Could not start the export");
    expect(component.preparing()).toBe(false);
    expect(fixture.nativeElement.querySelector("[data-testid=export-download]").disabled).toBe(false);
    click.mockRestore();
  });

  it("reports a summary that cannot be read and keeps the placeholders", async () => {
    await setUp(vi.fn(() => throwError(() => new Error("boom"))));

    expect(snackbar.error).toHaveBeenCalledWith("Could not read what the export would hold");
    expect(component.loading()).toBe(false);
    expect(text("export-file-size")).toContain("0 files");
  });
});

describe("formatByteSize", () => {
  it("reads like a person would say it", () => {
    expect(formatByteSize(0)).toBe("0 KB");
    expect(formatByteSize(300)).toBe("1 KB");
    expect(formatByteSize(840 * 1024)).toBe("840 KB");
    expect(formatByteSize(2.1 * 1024 * 1024)).toBe("2.1 MB");
    expect(formatByteSize(1.3 * 1024 * 1024 * 1024)).toBe("1.3 GB");
  });
});
