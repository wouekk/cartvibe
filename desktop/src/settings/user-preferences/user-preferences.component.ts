import { Component, computed, OnInit, signal, viewChild, inject, ChangeDetectionStrategy } from "@angular/core";
import { FormArray, FormBuilder, FormGroup, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { take, tap } from "rxjs";
import { FormMode } from "src/enums/form-mode.enum";
import { FormConfig } from "src/interfaces";
import { BaseFormComponent } from "../../form/index";
import { Permission, UserPreferencesService, UserShortcut } from "../../open-api";
import { SnackbarService } from "../../services";
import { parseGoalInput } from "../../overview/overview-chart.utils";
import { SystemSettingsState } from "../../store/system-settings.state";
import { AuthState, SetUserPreferences } from "../../store";
import { UserShortcutComponent } from "../user-shortcut/user-shortcut.component";
import { TranslationService } from "../../i18n/translation.service";
import { pluralMarker } from "../../i18n/marker";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import {
  automaticWarrantyYears,
  browserRegion,
  DEFAULT_WARRANTY_LEAD_DAYS,
  effectiveRegion,
  REGION_CHOICES,
  regionName,
  WARRANTY_PERIOD_CHOICES,
} from "../../utils/warranty-period";

/** The select cannot show an option whose value is "", so "from the browser" and Automatic have values of their own. */
const FROM_BROWSER = "browser";
const AUTOMATIC = "automatic";
const fromChoice = (value: string | null | undefined): string =>
  !value || value === FROM_BROWSER || value === AUTOMATIC ? "" : value;

/** "year" / "years" in the period options, counted with TranslationService.plural. */
pluralMarker("year", "years");

@UntilDestroy()
@Component({
    selector: "app-user-preferences",
    templateUrl: "./user-preferences.component.html",
    styleUrls: ["./user-preferences.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class UserPreferencesComponent extends BaseFormComponent implements OnInit {
  private readonly translation = inject(TranslationService);

  public readonly userShortcutComponent = viewChild(UserShortcutComponent);

  public formMode = FormMode;

  public originalUserShortcuts = signal<UserShortcut[]>([]);

  protected readonly canEdit = this.store.selectSignal(
    AuthState.hasAppPermission(Permission.AppUserPreferencesUpdate)
  );

  private readonly currencySymbol = this.store.selectSignal(SystemSettingsState.currencyDisplay);

  /** The region picked in the form, so the Automatic option can say what it resolves to. */
  private readonly regionValue = signal("");

  /** The countries offered: the browser's (empty), the EU and its outermost regions, and common others. */
  public readonly regionOptions = [
    { value: FROM_BROWSER, displayValue: this.translation.t("From the browser ({region})", { region: browserRegion() || "–" }) },
    ...REGION_CHOICES.map((code) => ({ value: code, displayValue: regionName(code, this.translation.locale()) })).sort(
      (a, b) => a.displayValue.localeCompare(b.displayValue)
    ),
  ];

  /** "Automatic (2 years)" for the region picked, then the fixed periods. */
  public readonly periodOptions = computed(() => {
    const automatic = automaticWarrantyYears(effectiveRegion(this.regionValue()));
    return [
      { value: AUTOMATIC, displayValue: this.translation.t("Automatic ({years})", { years: this.yearsLabel(automatic) }) },
      ...WARRANTY_PERIOD_CHOICES.map((years) => ({ value: String(years), displayValue: this.yearsLabel(years) })),
    ];
  });

  private yearsLabel(years: number): string {
    return `${years} ${this.translation.plural(years, "year", "years")}`;
  }

  /** "Monthly spending goal (€)", with the household's own currency symbol. */
  public readonly goalLabel = computed(() => this.translation.t("Monthly spending goal ({symbol})", { symbol: (this.currencySymbol() ?? "").trim() || "€" }));

  constructor(
    private activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder,
    private router: Router,
    private snackbarService: SnackbarService,
    private store: Store,
    private userPreferencesService: UserPreferencesService,
  ) {
    super();
  }

  public get userShortcuts(): FormArray {
    return this.form.get("userShortcuts") as FormArray;
  }

  public ngOnInit(): void {
    this.formConfig = this.editableConfig(this.activatedRoute.snapshot.data["formConfig"], this.canEdit());
    this.initForm();
  }

  private initForm(): void {
    const userPreferences = this.store.selectSnapshot(
      AuthState.userPreferences
    );
    this.originalUserShortcuts.set(userPreferences?.userShortcuts ?? []);

    this.form = this.formBuilder.group({
      quickScanDefaultPaidById: userPreferences?.quickScanDefaultPaidById ?? "",
      quickScanDefaultGroupId: userPreferences?.quickScanDefaultGroupId ?? "",
      quickScanDefaultStatus: userPreferences?.quickScanDefaultStatus ?? "",
      monthlySpendingGoal: userPreferences?.monthlySpendingGoal ? String(userPreferences.monthlySpendingGoal).replace(".", ",") : "",
      closeChipSelectOnSelect:
        userPreferences?.closeChipSelectOnSelect ?? false,
      userShortcuts: this.formBuilder.array(this.originalUserShortcuts().map((userShortcut, i) => this.buildUserShortcut(i, userShortcut))),
      region: userPreferences?.region || FROM_BROWSER,
      warrantyPeriodYears: userPreferences?.warrantyPeriodYears ? String(userPreferences.warrantyPeriodYears) : AUTOMATIC,
      warrantyReminderLeadDays: [
        String(userPreferences?.warrantyReminderLeadDays ?? DEFAULT_WARRANTY_LEAD_DAYS),
        [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)],
      ],
    });

    this.regionValue.set(fromChoice(this.form.get("region")?.value));
    this.form.get("region")?.valueChanges.pipe(untilDestroyed(this)).subscribe((region) => this.regionValue.set(fromChoice(region)));


    if (this.formConfig.mode === FormMode.view) {
      this.form.get("quickScanDefaultStatus")?.disable();
    }
  }

  private buildUserShortcut(index: number, userShortcut?: UserShortcut): FormGroup {
    return this.formBuilder.group({
      trackby: index,
      name: this.formBuilder.control(userShortcut?.name ?? "", Validators.required),
      icon: this.formBuilder.control(userShortcut?.icon ?? "", Validators.required),
      url: this.formBuilder.control(userShortcut?.url ?? "", Validators.required),
    });
  }

  public addNewShortcut(): void {
    const userShortcutComp = this.userShortcutComponent();
    if (!userShortcutComp) return;

    const userShortcuts = this.form.get("userShortcuts") as FormArray;
    const newUserShortcut = this.buildUserShortcut(
      userShortcuts.length
    );
    userShortcuts.push(newUserShortcut);
    this.originalUserShortcuts.update(prev => [...prev, newUserShortcut.value]);

    userShortcutComp.editableListComponent().openLastRow(userShortcuts.length - 1);
    userShortcutComp.isAddingShortcut = true;
  }

  public shortcutDoneClicked(): void {
    const userShortcutComp = this.userShortcutComponent();
    if (!userShortcutComp) return;

    if (this.userShortcuts.at(this.userShortcuts.length - 1).valid) {
      if (userShortcutComp.isAddingShortcut) {
        this.originalUserShortcuts.update(prev => [...prev, this.userShortcuts.at(this.userShortcuts.length - 1).value]);
      } else {
        const currentOpen = userShortcutComp.editableListComponent().getCurrentRowOpen();
        if (currentOpen !== undefined && currentOpen >= 0) {
          this.originalUserShortcuts.update(prev => {
            const updated = [...prev];
            updated[currentOpen] = this.userShortcuts.at(currentOpen).value;
            return updated;
          });
        }
      }

      userShortcutComp.isAddingShortcut = false;
      userShortcutComp.editableListComponent().closeRow();
    }
  }

  public shortcutCancelClicked(): void {
    const userShortcutComp = this.userShortcutComponent();
    if (!userShortcutComp) return;

    if (userShortcutComp.isAddingShortcut) {
      this.userShortcuts.removeAt(this.userShortcuts.length - 1);
      this.originalUserShortcuts.update(prev => prev.slice(0, prev.length - 1));
    } else {
      const currentOpen = userShortcutComp.editableListComponent().getCurrentRowOpen();
      if (currentOpen !== undefined && currentOpen >= 0) {
        this.userShortcuts.at(currentOpen).patchValue(this.originalUserShortcuts()[currentOpen]);
      }
    }

    userShortcutComp.isAddingShortcut = false;
    userShortcutComp.editableListComponent().closeRow();
  }


  /**
   * User settings are always editable (Save in the card footer, like System Settings): a view route turns into the
   * edit form for anyone who may update, so there is no pencil to press first.
   */
  private editableConfig(config: FormConfig, canEdit: boolean): FormConfig {
    return config?.mode === FormMode.view && canEdit ? { ...config, mode: FormMode.edit } : config;
  }

  public submit(): void {
    if (this.form.valid) {
      const result = this.form.value;
      if (result.quickScanDefaultPaidById === "") {
        result.quickScanDefaultPaidById = null;
      }

      // The spending goal: empty clears it, a comma decimal is fine, anything else is refused.
      const goal = parseGoalInput(result.monthlySpendingGoal ?? "");
      if (!goal.ok) {
        this.snackbarService.error("The monthly spending goal must be an amount above 0, like 500,00.");
        return;
      }
      result.monthlySpendingGoal = goal.value ?? null;

      // There is no per-person Dashboard currency any more (the household currency is an admin setting): saving
      // clears one an older version stored.
      result.displayCurrency = "";
      result.displayCurrencyRate = null;

      if (result.quickScanDefaultGroupId === "") {
        result.quickScanDefaultGroupId = null;
      }

      // Automatic is null; the lead time is a whole number of days, never negative (0 is on the day).
      result.region = fromChoice(result.region);
      result.warrantyPeriodYears = fromChoice(result.warrantyPeriodYears) ? Number(result.warrantyPeriodYears) : null;
      result.warrantyReminderLeadDays = Math.max(0, Number(result.warrantyReminderLeadDays) || 0);

      this.userPreferencesService
        .updateUserPreferences(result)
        .pipe(
          take(1),
          tap((updatedUserPreferences) => {
            this.snackbarService.success(
              "User preferences successfully updated"
            );
            this.store.dispatch(new SetUserPreferences(updatedUserPreferences));
            this.form.markAsPristine();
          })
        )
        .subscribe();
    }
  }
}
