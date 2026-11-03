import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmSwitchImports } from "@spartan-ng/helm/switch";
import { DEMO_MODE } from "../../demo/demo-runtime";
import { marker } from "../../i18n/marker";
import { PluralPipe, TranslatePipe } from "../../i18n/translate.pipe";
import { BackupService, BackupSummary } from "../../open-api";
import { SnackbarService } from "../../services";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { downloadUrl, formatByteSize } from "../../utils/file";

/** The export's tables shown on the card, by their file name in the ZIP. */
export const EXPORT_SUMMARY_ROWS = [
  { name: "receipts", label: marker("Receipts") },
  { name: "receipt_products", label: marker("Products on receipts") },
  { name: "shopping_lists", label: marker("Shopping lists") },
  { name: "shopping_list_items", label: marker("List items") },
  { name: "categories", label: marker("Categories") },
  { name: "tags", label: marker("Tags") },
  { name: "users", label: marker("People") },
];

/** The export URL; a plain navigation, so a large ZIP streams to disk instead of into memory. */
export function exportDownloadUrl(includeFiles: boolean): string {
  return `/api/backup/export?includeFiles=${includeFiles}`;
}

/**
 * The admin's Export & import tab: download the whole household as a ZIP of CSV files (with or without the
 * photos and PDFs), for keeping a copy or moving to another server. It is not the server backup.
 */
@Component({
  selector: "app-export-import-page",
  host: { class: "block" },
  templateUrl: "./export-import-page.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SharedUiModule, TranslatePipe, PluralPipe, CommonModule, HlmButton, AppIconComponent, ...HlmSwitchImports],
})
export class ExportImportPageComponent implements OnInit {
  private readonly backupService = inject(BackupService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);

  public readonly summary = signal<BackupSummary | null>(null);
  public readonly loading = signal(true);
  public readonly preparing = signal(false);
  public readonly started = signal(false);
  public readonly includeFiles = signal(true);

  public readonly rows = computed(() => {
    const counts = new Map((this.summary()?.counts ?? []).map((count) => [count.name, count.count]));
    return EXPORT_SUMMARY_ROWS.map((row) => ({ label: row.label, count: counts.get(row.name) }));
  });

  public readonly fileCount = computed(() => this.summary()?.fileCount ?? 0);

  public readonly fileSize = computed(() => formatByteSize(this.summary()?.fileBytes ?? 0));

  public ngOnInit(): void {
    this.backupService
      .getBackupSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackbarService.error(marker("Could not read what the export would hold"));
        },
      });
  }

  /**
   * Asks for the summary again first: the call goes through the interceptors, so an expired session is renewed
   * before the browser starts the plain download (which cannot renew it). Then the browser takes over.
   */
  public download(): void {
    this.preparing.set(true);
    this.backupService
      .getBackupSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.preparing.set(false);
          if (DEMO_MODE) {
            this.snackbarService.error(marker("Downloading the household is switched off in the demo."));
            return;
          }
          this.started.set(true);
          downloadUrl(exportDownloadUrl(this.includeFiles()));
        },
        error: () => {
          this.preparing.set(false);
          this.snackbarService.error(marker("Could not start the export"));
        },
      });
  }
}
