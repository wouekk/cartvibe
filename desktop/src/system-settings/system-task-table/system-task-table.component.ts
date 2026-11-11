import { TranslationService } from "../../i18n/translation.service";
import { DatePipe, NgIf } from "@angular/common";
import { Component, DestroyRef, OnInit, TemplateRef, computed, inject, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute } from "@angular/router";
import { take, tap } from "rxjs";
import { DEFAULT_DIALOG_CONFIG } from "../../constants/dialog.constant";
import { SystemTaskFilterFieldKey } from "../../constants";
import { AssociatedEntityType, ReceiptProcessingSettings, SystemTaskPagedRequestFilter } from "../../open-api";
import { TABLE_SERVICE_INJECTION_TOKEN } from "../../services/injection-tokens/table-service";
import { SystemTaskTableService } from "../../services/system-task-table.service";
import { TaskTableComponent } from "../../shared-ui/task-table/task-table.component";
import { UserStore } from "../../store";
import { SystemTaskTableStore } from "../../store/system-task-table.store";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { appDatePattern } from "../../utils/app-date-format";
import { applyFormCommand } from "../../utils/form.utils";
import { buildSystemTaskFilterChips, SystemTaskFilterChip } from "../../utils/system-task-filter-chips";
import { buildSystemTaskFilterForm } from "../../utils/system-task-filter";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { SystemTaskFilterComponent } from "../system-task-filter/system-task-filter.component";
import { SettingsSectionComponent } from "../../shared-ui/settings/settings-section.component";
import { HlmBadge } from "../../ui/badge/lib/hlm-badge";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { ReceiptProcessingSettingsChildSystemTaskAccordionComponent } from "../../receipt-processing-settings/receipt-processing-settings-child-system-task-accordion/receipt-processing-settings-child-system-task-accordion.component";
import { TranslatePipe } from "../../i18n/translate.pipe";

@Component({
    selector: "app-system-task-table",
    templateUrl: "./system-task-table.component.html",
    providers: [
        {
            provide: TABLE_SERVICE_INJECTION_TOKEN,
            useClass: SystemTaskTableService
        },
        DatePipe,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [SettingsSectionComponent, NgIf, HlmBadge, AppIconComponent, TaskTableComponent, ReceiptProcessingSettingsChildSystemTaskAccordionComponent, TranslatePipe, HlmButton, HlmTooltip]
})
export class SystemTaskTableComponent implements OnInit {
  private readonly userStore = inject(UserStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly systemTaskTableStore = inject(SystemTaskTableStore);

  public readonly expandedRowTemplate = viewChild.required<TemplateRef<any>>("expandedRowTemplate");
  public readonly taskTableComponent = viewChild.required(TaskTableComponent);

  public allReceiptProcessingSettings: ReceiptProcessingSettings[] = [];
  protected readonly AssociatedEntityType = AssociatedEntityType;
  private readonly destroyRef = inject(DestroyRef);

  public filter = this.systemTaskTableStore.filter;

  public numFiltersApplied = this.systemTaskTableStore.numFiltersApplied;

  /**
   * Handed to `app-task-table` so it reads the filter when it builds the
   * request. A stable reference, so the binding's identity never changes; see
   * `TaskTableComponent.filterProvider` for why it cannot be the value.
   */
  public readonly filterProvider = (): SystemTaskPagedRequestFilter => this.filter();

  private users = this.userStore.users;

  private dateFormat = this.systemSettingsStore.dateFormat;

  public filterChips = computed<SystemTaskFilterChip[]>(() =>
    buildSystemTaskFilterChips(this.filter(), {
      users: this.users(),
      // Not appDate: a filter value is the day the user PICKED, held as a
      // local-midnight Date (or its ISO string once persisted), so it is read
      // on the browser's calendar — the same day toDateWireFilter sends.
      formatDate: (value) => {
        const locale = this.translation.locale();
        return this.datePipe.transform(value as string, appDatePattern("mediumDate", this.dateFormat(), locale), undefined, locale) ?? "";
      },
      translate: (text) => this.translation.t(text),
    })
  );

  constructor(
    private activatedRoute: ActivatedRoute,
    private dialog: AppDialog,
    private datePipe: DatePipe,
    private translation: TranslationService
  ) {}

  public ngOnInit(): void {
    this.allReceiptProcessingSettings = this.activatedRoute.snapshot.data["allReceiptProcessingSettings"] || [];
  }

  public refresh(): void {
    this.taskTableComponent().getTableData();
  }

  public filterButtonClicked(): void {
    const dialogRef = this.dialog.open(SystemTaskFilterComponent, {
      ...DEFAULT_DIALOG_CONFIG,
      minWidth: "75%",
      maxWidth: "100%",
    });
    dialogRef.componentInstance.headerText = "Filter System Tasks";
    dialogRef.componentInstance.parentForm = buildSystemTaskFilterForm(this.filter(), this.destroyRef);

    const formCommandSubscription = dialogRef.componentInstance.formCommand.subscribe(
      (formCommand) => applyFormCommand(dialogRef.componentInstance.parentForm, formCommand)
    );

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((applyFilter) => {
          if (applyFilter) {
            this.systemTaskTableStore.setPage(1);
            this.refresh();
          }

          formCommandSubscription.unsubscribe();
        })
      )
      .subscribe();
  }

  public resetFilterButtonClicked(): void {
    this.systemTaskTableStore.resetFilter();
    this.filterChanged();
  }

  public filterChipCleared(field: SystemTaskFilterFieldKey): void {
    this.systemTaskTableStore.setFilterField(field, null);
    this.filterChanged();
  }

  /**
   * Every filter write outside the dialog ends here so the page reset
   * cannot be forgotten — narrowing from page 7 would otherwise land the user
   * on an empty page.
   */
  private filterChanged(): void {
    this.systemTaskTableStore.setPage(1);
    this.refresh();
  }
}
