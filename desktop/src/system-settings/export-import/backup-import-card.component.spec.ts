import { HttpEventType } from "@angular/common/http";
import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, Subject, throwError } from "rxjs";
import { AppDialog } from "../../dialog/app-dialog";
import { BackupImportJob, BackupImportPreview, BackupService } from "../../open-api";
import { SnackbarService } from "../../services";
import { BackupImportCardComponent, IMPORT_POLL_MS } from "./backup-import-card.component";
import { BackupImportPreviewDialogComponent } from "./backup-import-preview-dialog.component";

import type { Mock } from "vitest";

const job = (status: string, extra: Partial<BackupImportJob> = {}): BackupImportJob => ({
  id: 4,
  status,
  phase: "",
  processed: 0,
  total: 0,
  fileName: "cartvibe-backup.zip",
  fileSize: 100,
  error: "",
  imported: [],
  createdAt: "2026-11-03T20:00:00Z",
  ...extra,
});

const preview = { jobId: 4, people: [], counts: [], warnings: [], blockers: [], problems: [] } as unknown as BackupImportPreview;

describe("BackupImportCardComponent", () => {
  let fixture: ComponentFixture<BackupImportCardComponent>;
  let component: BackupImportCardComponent;
  let backupService: { getBackupImports: Mock; getBackupImport: Mock; previewBackupImport: Mock };
  let dialog: { open: Mock };
  let afterClosed: Subject<BackupImportJob | undefined>;

  const setUp = async (jobs: BackupImportJob[]): Promise<void> => {
    afterClosed = new Subject();
    backupService = {
      getBackupImports: vi.fn(() => of(jobs)),
      getBackupImport: vi.fn(),
      previewBackupImport: vi.fn(),
    };
    dialog = { open: vi.fn(() => ({ afterClosed: () => afterClosed })) };

    await TestBed.configureTestingModule({
      imports: [BackupImportCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BackupService, useValue: backupService },
        { provide: AppDialog, useValue: dialog },
        { provide: SnackbarService, useValue: { error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BackupImportCardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  };

  const status = (): string | null =>
    fixture.nativeElement.querySelector("[data-testid=import-status]")?.getAttribute("data-status") ?? null;

  const pick = (file: File): void => {
    const input = fixture.nativeElement.querySelector("[data-testid=import-file-input]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
  };

  afterEach(() => vi.useRealTimers());

  it("shows the last finished import with its next steps, and never a mere upload", async () => {
    await setUp([job("previewed", { id: 5 }), job("succeeded", { imported: [{ name: "receipts", count: 12 }] })]);

    expect(status()).toBe("succeeded");
    expect(fixture.nativeElement.querySelector("[data-testid=import-result]").textContent).toContain("12");
    expect(fixture.nativeElement.querySelector("[data-testid=import-next-steps]")).not.toBeNull();
  });

  it("says that nothing changed when an import failed", async () => {
    await setUp([job("failed", { error: "the household already has receipts" })]);

    expect(fixture.nativeElement.textContent).toContain("Nothing was changed");
    expect(fixture.nativeElement.querySelector("[data-testid=import-error]").textContent).toContain("already has receipts");
  });

  it("uploads the file, opens the preview and follows the started import to its end", async () => {
    await setUp([]);
    vi.useFakeTimers();
    const upload = new Subject<unknown>();
    backupService.previewBackupImport.mockReturnValue(upload);
    backupService.getBackupImport
      .mockReturnValueOnce(of(job("running", { phase: "staging_files", processed: 1, total: 4 })))
      .mockReturnValueOnce(of(job("succeeded")));

    pick(new File(["zip"], "cartvibe-backup.zip"));
    upload.next({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(component.uploadPercent()).toBe(50);
    expect(component.busy()).toBe(true);

    upload.next({ type: HttpEventType.Response, body: preview });
    expect(dialog.open).toHaveBeenCalledWith(BackupImportPreviewDialogComponent, expect.objectContaining({ data: preview }));
    expect(component.uploading()).toBe(false);

    afterClosed.next(job("queued"));
    expect(component.active()).toBe(true);

    await vi.advanceTimersByTimeAsync(IMPORT_POLL_MS);
    expect(component.percent()).toBe(25);
    expect(component.phaseText()).toBe("Copying the photos…");

    await vi.advanceTimersByTimeAsync(IMPORT_POLL_MS);
    expect(component.job()?.status).toBe("succeeded");
    await vi.advanceTimersByTimeAsync(IMPORT_POLL_MS * 3);
    expect(backupService.getBackupImport).toHaveBeenCalledTimes(2);
  });

  it("lets the person try again after a refused upload", async () => {
    await setUp([]);
    backupService.previewBackupImport.mockReturnValue(throwError(() => new Error("not an export")));

    pick(new File(["text"], "notes.txt"));
    await fixture.whenStable();

    expect(component.uploading()).toBe(false);
    expect(dialog.open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector("[data-testid=import-file-input]").disabled).toBe(false);
  });

  it("does nothing when the preview is cancelled", async () => {
    await setUp([]);
    backupService.previewBackupImport.mockReturnValue(of({ type: HttpEventType.Response, body: preview }));

    pick(new File(["zip"], "cartvibe-backup.zip"));
    afterClosed.next(undefined);

    expect(component.job()).toBeNull();
    expect(backupService.getBackupImport).not.toHaveBeenCalled();
  });
});
