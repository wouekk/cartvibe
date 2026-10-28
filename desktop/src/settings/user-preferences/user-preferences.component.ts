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
    });


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
