import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Inject,
  inject,
  signal,
} from "@angular/core";
import { Location } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { APP_DIALOG_DATA, AppDialogRef } from "../../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { Receipt, ReportRequestCommand, ReportService } from "../../../open-api";
import { SystemSettingsState } from "../../../store/system-settings.state";
import { marker } from "../../../i18n/marker";
import { TranslateFn } from "../../../i18n/translate-fn";
import { TranslationService } from "../../../i18n/translation.service";
import { ReportBuilderValue } from "../../models/report-command.mapper";
import {
  formatPeriodRange,
  reportPeriodDateFieldHint,
  resolvePeriodRange,
  toReportPeriodDateField,
} from "../../models/report-period.util";
import { DialogComponent } from "../../../shared-ui/dialog/dialog.component";
import { AppIconComponent } from "../../../shared-ui/icon/icon.component";
import { ButtonComponent } from "../../../button/button/button.component";
import { StatusChipComponent } from "../../../shared-ui/status-chip/status-chip.component";
import { MoneyComponent } from "../../../shared-ui/money/money.component";
import { TranslatePipe, PluralPipe } from "../../../i18n/translate.pipe";
import { AppDatePipe } from "../../../pipes/app-date.pipe";

export interface ReportReceiptsDialogData {
  // The command the preview ran, so the list covers exactly what it counted.
  command: ReportRequestCommand;
  // The builder's period, for the subtitle only.
  period: ReportBuilderValue["period"];
  // The report's true covered count (from the preview), shown in the subtitle;
  // falls back to the list's own total when absent.
  receiptCount?: number;
}

/**
 * Lists the receipts a report covers. The server resolves the report's filter and
 * period (on its own clock, in the app time zone) and runs the report's own query,
 * so the list matches the preview's count. The subtitle resolves the period in
 * the same app zone, never the browser's. Read-only — it exists so a user can sanity-check
 * what's flowing into the report.
 */
@Component({
    selector: "app-report-receipts-dialog",
    templateUrl: "./report-receipts-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        DialogComponent,
        AppIconComponent,
        ButtonComponent,
        StatusChipComponent,
        MoneyComponent,
        TranslatePipe,
        PluralPipe,
        AppDatePipe,
    ],
})
export class ReportReceiptsDialogComponent {
  private readonly reportService = inject(ReportService);
  private readonly dialogRef = inject(AppDialogRef<ReportReceiptsDialogComponent>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(Store);
  private readonly translation = inject(TranslationService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  public readonly loading = signal<boolean>(true);
  public readonly receipts = signal<Receipt[]>([]);
  // Set when the list fails to load.
  public readonly hasError = signal<boolean>(false);
  // The receipt being inspected; null shows the list, non-null the breakdown.
  public readonly selected = signal<Receipt | null>(null);

  public readonly periodLabel: string;
  private readonly providedCount?: number;
  // Every receipt the list covers; the server caps the list itself.
  public readonly totalCount = signal<number>(0);
  // Subtitle count: the report's true total when known, else the list's own total.
  public readonly count = computed(() => this.providedCount ?? this.totalCount());
  // The server returned only the newest receipts, not all of them.
  public readonly truncated = computed(() => this.receipts().length < this.totalCount());

  constructor(@Inject(APP_DIALOG_DATA) data: ReportReceiptsDialogData) {
    const timeZone = this.store.selectSnapshot(SystemSettingsState.timeZone);
    const translate: TranslateFn = (text, params) => this.translation.t(text, params);
    const range = formatPeriodRange(
      resolvePeriodRange(data.period.preset, data.period.startDate, data.period.endDate, timeZone),
      translate
    );
    const dateField = reportPeriodDateFieldHint(toReportPeriodDateField(data.period.dateField), timeZone, translate);
    this.periodLabel = this.translation.t(marker("{range} on {field}"), { range, field: dateField });
    this.providedCount = data.receiptCount;
    this.load(data.command);
  }

  public viewReceipt(receipt: Receipt): void {
    this.selected.set(receipt);
  }

  public backToList(): void {
    this.selected.set(null);
  }

  /** Opens the receipt's full page in a new tab (read-only drill-in stays open). */
  public openFullReceipt(receipt: Receipt): void {
    // Through the router's location strategy: the same path as before in the app, and under the demo's base and hash.
    const path = this.router.serializeUrl(this.router.createUrlTree(["/receipts", receipt.id, "view"]));
    window.open(this.location.prepareExternalUrl(path), "_blank");
  }

  public close(): void {
    this.dialogRef.close();
  }

  private load(command: ReportRequestCommand): void {
    this.reportService
      .getReportReceipts(command)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (paged) => {
          this.receipts.set((paged.data ?? []) as unknown as Receipt[]);
          this.totalCount.set(paged.totalCount ?? 0);
          this.loading.set(false);
        },
        error: () => {
          this.hasError.set(true);
          this.loading.set(false);
        },
      });
  }
}
