import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { NgxsModule } from "@ngxs/store";
import { of, throwError } from "rxjs";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { BackupImportPreview, BackupService } from "../../open-api";
import { BackupImportPreviewDialogComponent } from "./backup-import-preview-dialog.component";

import type { Mock } from "vitest";

const basePreview: BackupImportPreview = {
  jobId: 9,
  fileName: "cartvibe-backup-2026-11-03.zip",
  exportedAt: "2026-11-03T20:00:00Z",
  appVersion: "0.16.0",
  includesFiles: true,
  currencyDisplay: "zł",
  timeZone: "Europe/Warsaw",
  counts: [
    { name: "receipts", count: 73 },
    { name: "receipt_products", count: 330 },
  ],
  fileCount: 41,
  people: [
    { sourceId: 1, username: "anna", displayName: "Anna", match: "account" },
    { sourceId: 2, username: "piotr", displayName: "Piotr", match: "name_only" },
  ],
  suggestedMeSourceId: 1,
  categoriesMatched: 30,
  categoriesNew: 2,
  tagsMatched: 0,
  tagsNew: 1,
  warnings: ["currency_set", "something_new"],
  blockers: [],
  problems: [],
};

describe("BackupImportPreviewDialogComponent", () => {
  let fixture: ComponentFixture<BackupImportPreviewDialogComponent>;
  let component: BackupImportPreviewDialogComponent;
  let backupService: { startBackupImport: Mock; deleteBackupImport: Mock };
  let dialogRef: { close: Mock };

  const setUp = async (preview: BackupImportPreview, startBackupImport: Mock = vi.fn(() => of({ id: 9, status: "queued" }))): Promise<void> => {
    backupService = { startBackupImport, deleteBackupImport: vi.fn(() => of(undefined)) };
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BackupImportPreviewDialogComponent, NgxsModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: APP_DIALOG_DATA, useValue: preview },
        { provide: AppDialogRef, useValue: dialogRef },
        { provide: BackupService, useValue: backupService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BackupImportPreviewDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  const text = (testId: string): string => fixture.nativeElement.querySelector(`[data-testid=${testId}]`)?.textContent ?? "";

  it("shows the counts, the people and only the warnings it knows", async () => {
    await setUp(basePreview);

    expect(text("import-preview-counts")).toContain("73");
    expect(text("import-preview-counts")).toContain("41");
    expect(text("import-preview-people")).toContain("Account");
    expect(text("import-preview-people")).toContain("Name only");
    expect(component.warnings).toEqual(["The household currency will be set to the one in the file."]);
    expect(fixture.nativeElement.querySelector("[data-testid=import-preview-blockers]")).toBeNull();
  });

  it("starts the import as the suggested person and closes with the job", async () => {
    await setUp(basePreview);

    component.start();

    expect(backupService.startBackupImport).toHaveBeenCalledWith(9, { meSourceUserId: 1 });
    expect(dialogRef.close).toHaveBeenCalledWith({ id: 9, status: "queued" });
  });

  it("starts without a person when none of them is picked", async () => {
    await setUp(basePreview);

    component.meControl.setValue("");
    component.start();

    expect(backupService.startBackupImport).toHaveBeenCalledWith(9, { meSourceUserId: undefined });
  });

  it("will not start while something blocks the import, and says why", async () => {
    await setUp({ ...basePreview, blockers: ["household_not_empty", "invalid_rows"], problems: ["receipts.csv row 3 amount: is not an amount"] });

    expect(component.canImport()).toBe(false);
    expect(text("import-preview-blockers")).toContain("already has receipts");
    expect(text("import-preview-problems")).toContain("receipts.csv row 3");
    component.start();
    expect(backupService.startBackupImport).not.toHaveBeenCalled();
  });

  it("stays open when the start is refused, so the person can cancel", async () => {
    await setUp(basePreview, vi.fn(() => throwError(() => new Error("not empty"))));

    component.start();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.starting()).toBe(false);
  });

  it("drops the uploaded file on Cancel", async () => {
    await setUp(basePreview);

    component.cancel();

    expect(backupService.deleteBackupImport).toHaveBeenCalledWith(9);
    expect(dialogRef.close).toHaveBeenCalledWith(undefined);
  });
});
