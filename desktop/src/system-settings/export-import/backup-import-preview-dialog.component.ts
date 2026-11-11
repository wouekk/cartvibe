import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { FormControl } from "@angular/forms";
import { APP_DIALOG_DATA, AppDialogRef } from "../../dialog/app-dialog";
import { marker } from "../../i18n/marker";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { BackupImportJob, BackupImportPreview, BackupService } from "../../open-api";
import { SelectModule } from "../../select/select.module";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";

/** The tables the preview counts, by their file name in the export. */
export const IMPORT_PREVIEW_ROWS = [
  { name: "receipts", label: marker("Receipts") },
  { name: "receipt_products", label: marker("Products on receipts") },
  { name: "shopping_lists", label: marker("Shopping lists") },
  { name: "shopping_list_items", label: marker("List items") },
  { name: "report_templates", label: marker("Report templates") },
];

/** The server's warnings (open strings), in words. An unknown one is not shown. */
export const IMPORT_WARNING_TEXTS: Record<string, string> = {
  currency_set: marker("The household currency will be set to the one in the file."),
  time_zone_set: marker("The time zone will be set to the one in the file."),
  files_not_included: marker("The file has no photos or PDFs: the receipts come without them."),
  files_missing: marker("Some photos were deleted while the file was made; those receipts come without them."),
  template_replaced: marker("Report templates with the same name as one here are replaced by the ones in the file."),
  unknown_group_role: marker("Some people had a household role this server does not have; they become members."),
};

/** The server's blockers (open strings), in words. */
export const IMPORT_BLOCKER_TEXTS: Record<string, string> = {
  household_not_empty: marker("This server already has receipts or shopping lists. A file can only be imported into an empty household."),
  invalid_rows: marker("Some rows in the file cannot be imported:"),
};

const NONE_OF_THEM = "";

/**
 * What an import would do, before anything is written: the counts, the people (an account here, or kept as a
 * name), which person is the admin importing, and anything that stops or changes the import. Import starts it;
 * Cancel drops the uploaded file. Closes with the queued job, or nothing.
 */
@Component({
  selector: "app-backup-import-preview-dialog",
  templateUrl: "./backup-import-preview-dialog.component.html",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SharedUiModule, SelectModule, TranslatePipe, AppIconComponent],
})
export class BackupImportPreviewDialogComponent {
  protected readonly preview = inject<BackupImportPreview>(APP_DIALOG_DATA);
  private readonly dialogRef = inject<AppDialogRef<BackupImportPreviewDialogComponent, BackupImportJob>>(AppDialogRef);
  private readonly backupService = inject(BackupService);

  public readonly starting = signal(false);

  public readonly meControl = new FormControl<number | string>(this.preview.suggestedMeSourceId ?? NONE_OF_THEM, { nonNullable: true });

  public readonly meOptions = [
    { value: NONE_OF_THEM, label: marker("None of them") },
    ...this.preview.people.map((person) => ({ value: person.sourceId, label: `${person.displayName || person.username} (${person.username})` })),
  ];

  public readonly rows = IMPORT_PREVIEW_ROWS.map((row) => ({
    label: row.label,
    count: this.preview.counts.find((count) => count.name === row.name)?.count ?? 0,
  }));

  public readonly warnings = this.preview.warnings.map((warning) => IMPORT_WARNING_TEXTS[warning]).filter((text) => !!text);

  public readonly blockers = this.preview.blockers.map((blocker) => IMPORT_BLOCKER_TEXTS[blocker] ?? blocker);

  public readonly canImport = computed(() => this.preview.blockers.length === 0 && !this.starting());

  public start(): void {
    if (!this.canImport()) {
      return;
    }
    this.starting.set(true);
    const me = this.meControl.getRawValue();
    this.backupService.startBackupImport(this.preview.jobId, { meSourceUserId: me === NONE_OF_THEM ? undefined : Number(me) }).subscribe({
      next: (job) => this.dialogRef.close(job),
      // The interceptor shows the server's message; the dialog stays so the person can cancel.
      error: () => this.starting.set(false),
    });
  }

  public cancel(): void {
    this.backupService.deleteBackupImport(this.preview.jobId).subscribe({ error: () => undefined });
    this.dialogRef.close(undefined);
  }
}
