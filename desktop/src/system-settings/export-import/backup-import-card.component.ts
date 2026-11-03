import { HttpEventType } from "@angular/common/http";
import { buttonVariants } from "@spartan-ng/helm/button";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, switchMap, takeWhile, timer } from "rxjs";
import { DEMO_MODE } from "../../demo/demo-runtime";
import { AppDialog } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { BackupImportJob, BackupImportPreview, BackupService } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { BackupImportPreviewDialogComponent } from "./backup-import-preview-dialog.component";

/** How often a running import is asked about. */
export const IMPORT_POLL_MS = 2000;

const ACTIVE_STATUSES = ["queued", "running"];

/** The phases of a running import (open strings), in words. */
export const IMPORT_PHASE_TEXTS: Record<string, string> = {
  staging_files: marker("Copying the photos…"),
  writing: marker("Writing the household…"),
};

/** The names of the imported tables shown in the result, by their file name in the export. */
export const IMPORT_RESULT_ROWS = [
  { name: "receipts", label: marker("Receipts") },
  { name: "receipt_products", label: marker("Products on receipts") },
  { name: "shopping_lists", label: marker("Shopping lists") },
  { name: "files", label: marker("Photos and PDFs") },
  { name: "users", label: marker("People kept as a name") },
];

/**
 * The Import card of the Export & import tab: upload an export (a native label around the file input, so phones
 * open their file picker), preview it in a dialog, then follow the queued import until it ends.
 */
@Component({
  selector: "app-backup-import-card",
  host: { class: "block" },
  templateUrl: "./backup-import-card.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SharedUiModule, TranslatePipe, AppIconComponent],
})
export class BackupImportCardComponent implements OnInit {
  private readonly backupService = inject(BackupService);
  private readonly dialog = inject(AppDialog);
  private readonly snackbarService = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);
  private watching?: Subscription;

  /** The file label looks like the primary button; it stays a label so phones open their picker. */
  protected readonly chooseButtonClass = buttonVariants({ variant: "default" });

  public readonly job = signal<BackupImportJob | null>(null);
  public readonly uploading = signal(false);
  public readonly uploadPercent = signal(0);

  public readonly active = computed(() => ACTIVE_STATUSES.includes(this.job()?.status ?? ""));
  public readonly busy = computed(() => this.uploading() || this.active());
  public readonly phaseText = computed(() => IMPORT_PHASE_TEXTS[this.job()?.phase ?? ""] ?? marker("Waiting to start…"));
  public readonly percent = computed(() => {
    const job = this.job();
    return job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : null;
  });
  public readonly imported = computed(() => {
    const counts = new Map((this.job()?.imported ?? []).map((count) => [count.name, count.count]));
    return IMPORT_RESULT_ROWS.filter((row) => counts.has(row.name)).map((row) => ({ label: row.label, count: counts.get(row.name) ?? 0 }));
  });

  public ngOnInit(): void {
    this.backupService
      .getBackupImports()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (jobs) => {
          // A previewed job is an upload nobody started (a closed tab): not worth showing.
          const latest = jobs.find((job) => job.status !== "previewed") ?? null;
          this.job.set(latest);
          if (latest && ACTIVE_STATUSES.includes(latest.status)) {
            this.watch(latest.id);
          }
        },
        error: () => undefined,
      });
  }

  public chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // The same file can be picked again after a cancelled preview.
    input.value = "";
    if (!file) {
      return;
    }
    if (DEMO_MODE) {
      this.snackbarService.error(marker("Importing is switched off in the demo."));
      return;
    }

    this.uploading.set(true);
    this.uploadPercent.set(0);
    this.backupService
      .previewBackupImport(file, "events", true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploadPercent.set(Math.round((event.loaded / event.total) * 100));
          }
          if (event.type === HttpEventType.Response && event.body) {
            this.uploading.set(false);
            this.openPreview(event.body);
          }
        },
        // The interceptor shows the server's reason (not an export, damaged, too large).
        error: () => this.uploading.set(false),
      });
  }

  private openPreview(preview: BackupImportPreview): void {
    this.dialog
      // Focus the dialog, not the first field: the reason an import is blocked sits at the top.
      .open(BackupImportPreviewDialogComponent, { width: "min(calc(100vw - 2rem), 36rem)", autoFocus: "dialog", data: preview })
      .afterClosed()
      .subscribe((job?: BackupImportJob) => {
        if (job) {
          this.job.set(job);
          this.watch(job.id);
        }
      });
  }

  private watch(jobId: number): void {
    this.watching?.unsubscribe();
    this.watching = timer(IMPORT_POLL_MS, IMPORT_POLL_MS)
      .pipe(
        switchMap(() => this.backupService.getBackupImport(jobId)),
        takeWhile((job) => ACTIVE_STATUSES.includes(job.status), true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (job) => this.job.set(job),
        error: () => this.snackbarService.error(marker("Lost track of the import. Reload the page to see how it ended.")),
      });
  }
}
