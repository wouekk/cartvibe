import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormArray, FormBuilder, FormGroup } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { Store } from "@ngxs/store";
import { EMPTY, catchError, debounceTime, finalize, startWith, switchMap, take, tap } from "rxjs";
import { Permission, ReportPeriod, ReportRequestCommand, ReportTemplate } from "../../open-api";
import {
  enabledReportColumns,
  ReportBuilderValue,
  toReportRequestCommand,
  toReportRequestCommandForSave,
} from "../models/report-command.mapper";
import { SnackbarService } from "../../services";
import { AuthState } from "../../store";
import { buildReportForm, buildReportFormFromCommand } from "../models/report-form.factory";
import { ReportRunnerService } from "../services/report-runner.service";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { localizeStoredTexts, restoreStoredTexts } from "../models/report-stored-text";

/**
 * The Report Builder screen: owns the report form, drives the debounced live
 * preview, and runs the synchronous generate-and-download. The config panel,
 * preview panel, and generate bar are presentational children bound to this form.
 */
@Component({
  selector: "app-report-builder",
  host: { class: "block h-full min-h-0" },
  templateUrl: "./report-builder.component.html",
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportBuilderComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly runner = inject(ReportRunnerService);
  private readonly snackbar = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly translation = inject(TranslationService);
  private readonly storedText = (text: string) => this.translation.data(text);

  // On the edit route a resolver supplies the saved template; on "new" it is absent.
  // Read it before the form initializer so the form can be built from its stored
  // configuration synchronously — the constructor's preview subscription then fires
  // once and previews the loaded template (no post-construction patch/rebuild).
  private readonly loadedTemplate: ReportTemplate | null = this.route.snapshot.data["template"] ?? null;

  /** The opened template's name for the breadcrumb (a starter report's in the reader's language), or null when starting fresh. */
  public readonly loadedTemplateName = computed<string | null>(() =>
    this.loadedTemplate?.name ? this.translation.data(this.loadedTemplate.name) : null
  );

  /** Edit route (a template was resolved) vs the blank "new report" route. */
  public readonly isEditMode: boolean = this.loadedTemplate != null;

  // Save creates a new template on the "new" route and updates in place on the edit
  // route, so its permission gate follows the mode: create vs update. Each mode honors
  // both the base and the "*All" variant — the permission matcher treats "…create" and
  // "…createAll" as unrelated keys, so gating on the base alone would hide Save from an
  // "*All"-only holder. Resolved through the AuthState selector, exactly like the sidebar.
  public readonly saveTemplateAllowed = this.store.selectSignal(
    AuthState.hasAnyAppPermission(
      this.isEditMode
        ? [Permission.AppReportsUpdate, Permission.AppReportsUpdateAll]
        : [Permission.AppReportsCreate, Permission.AppReportsCreateAll]
    )
  );

  // Generate honors app.reports.generate and its "*All" variant for the same reason.
  public readonly generateAllowed = this.store.selectSignal(
    AuthState.hasAnyAppPermission([
      Permission.AppReportsGenerate,
      Permission.AppReportsGenerateAll,
    ])
  );

  public readonly form: FormGroup = this.loadedTemplate
    ? buildReportFormFromCommand(
        this.formBuilder,
        this.destroyRef,
        // The starter reports are stored in English; their texts read in the person's language (restored on save).
        localizeStoredTexts(this.loadedTemplate.configuration, this.storedText)
      )
    : buildReportForm(this.formBuilder, this.destroyRef);

  public readonly previewHtml = signal<string>("");
  public readonly receiptCount = signal<number>(0);
  public readonly previewLoading = signal<boolean>(false);
  public readonly previewError = signal<boolean>(false);
  public readonly generating = signal<boolean>(false);
  public readonly saving = signal<boolean>(false);

  // A tick that recomputes the run-readiness guards whenever the form changes.
  private readonly formTick = toSignal(this.form.valueChanges.pipe(startWith(null)), {
    initialValue: null,
  });

  /** Preview needs a group, at least one column, and (for custom) both dates. */
  public readonly canPreview = computed<boolean>(() => {
    this.formTick();
    return this.isRunnable();
  });

  /** Generate additionally needs at least one output format selected. */
  public readonly canGenerate = computed<boolean>(() => {
    this.formTick();
    return this.isRunnable() && this.selectedFormatCount() > 0;
  });

  /** Saving a template is Generate's validity plus a non-empty name to save under. */
  public readonly canSaveTemplate = computed<boolean>(() => {
    this.formTick();
    const name = (this.form.get("name")!.value as string) ?? "";
    return this.isRunnable() && this.selectedFormatCount() > 0 && name.trim().length > 0;
  });

  constructor() {
    this.form.valueChanges
      .pipe(
        startWith(null),
        tap(() => {
          if (this.isRunnable()) {
            this.previewLoading.set(true);
          }
        }),
        debounceTime(450),
        switchMap(() => {
          if (!this.isRunnable()) {
            this.previewHtml.set("");
            this.receiptCount.set(0);
            this.previewLoading.set(false);
            return EMPTY;
          }
          return this.runner.preview(this.currentCommand()).pipe(
            catchError(() => {
              this.previewError.set(true);
              this.previewLoading.set(false);
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((preview) => {
        this.previewHtml.set(preview.html);
        this.receiptCount.set(preview.receiptCount);
        this.previewError.set(false);
        this.previewLoading.set(false);
      });
  }

  /** Generates the report and downloads it (a single file, or a zip of formats). */
  public generate(): void {
    if (!this.canGenerate() || this.generating()) {
      return;
    }
    this.generating.set(true);
    this.runner
      .generateAndDownload(this.currentCommand())
      .pipe(
        take(1),
        catchError(() => EMPTY), // the HTTP interceptor surfaces the failure toast
        finalize(() => this.generating.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /**
   * Persists the current configuration. On the edit route it updates the opened
   * template in place; on the new route it creates a fresh one. (Duplicating a
   * template is a separate row action on the list — this is never save-as-new.)
   */
  public saveTemplate(): void {
    if (!this.canSaveTemplate() || this.saving()) {
      return;
    }
    this.saving.set(true);
    const loaded = this.loadedTemplate;
    const command = this.commandForSave();
    const request$ = loaded
      ? this.runner.updateTemplate(loaded.id, command)
      : this.runner.saveTemplate(command);
    const successMessage = loaded ? marker("Template updated") : marker("Template saved");
    request$
      .pipe(
        take(1),
        tap(() => this.snackbar.success(successMessage)),
        catchError(() => EMPTY), // the HTTP interceptor surfaces the failure toast
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private currentCommand(): ReportRequestCommand {
    return toReportRequestCommand(this.form.getRawValue() as ReportBuilderValue);
  }

  // The command persisted on save keeps every column, including currently-disabled
  // ones, so they round-trip into the builder and self-heal; preview and generate
  // still send enabled-only columns via currentCommand().
  // A starter text left as shown goes back in English, so the template keeps reading in each person's language.
  private commandForSave(): ReportRequestCommand {
    const command = toReportRequestCommandForSave(this.form.getRawValue() as ReportBuilderValue);
    return this.loadedTemplate
      ? restoreStoredTexts(command, this.loadedTemplate.configuration, this.storedText)
      : command;
  }

  private isRunnable(): boolean {
    const scope = this.form.get("scope") as FormArray;
    if (scope.length === 0) {
      return false;
    }
    // At least one column must actually be sent: an aggregate config whose only
    // columns are disabled (invalid) dimensions would post an empty spec.
    const value = this.form.getRawValue() as ReportBuilderValue;
    if (enabledReportColumns(value).length === 0) {
      return false;
    }
    const period = value.period;
    if (period.preset === ReportPeriod.PresetEnum.Custom) {
      return !!period.startDate && !!period.endDate;
    }
    return true;
  }

  private selectedFormatCount(): number {
    const formats = this.form.get("formats")!.value as Record<string, boolean>;
    return Object.values(formats).filter(Boolean).length;
  }
}
