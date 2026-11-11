import { Component, DestroyRef, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { switchMap, take, tap } from "rxjs";
import { FormMode } from "../../enums/form-mode.enum";
import { BaseFormComponent, setRequired } from "../../form/index";
import {
  Group,
  GroupsService,
  Permission,
  QuickScanDefaultPaidByType,
  UpdateGroupReceiptSettingsCommand,
} from "../../open-api/index";
import { SnackbarService } from "../../services/index";
import { GroupStore, AuthStore } from "../../store/index";
import { marker } from "../../i18n/marker";
import { FormComponent } from "../../shared-ui/form/form.component";
import { AuditDetailSectionComponent } from "../../shared-ui/audit-detail-section/audit-detail-section.component";
import { FormSectionComponent } from "../../shared-ui/form-section/form-section.component";
import { CheckboxComponent } from "../../checkbox/checkbox/checkbox.component";
import { SelectComponent } from "../../select/select/select.component";
import { UserAutocompleteComponent } from "../../user-autocomplete/user-autocomplete/user-autocomplete.component";
import { StatusSelectComponent } from "../../shared-ui/status-select/status-select.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

/**
 * A household's receipt settings: what the receipt form leaves out, whether Quick Scan asks for a note, and the
 * two defaults a scan falls back on. A Quick Scan is otherwise a photo and nothing else, so there is no switch
 * per field any more.
 */
@Component({
    selector: "app-group-receipt-settings",
    templateUrl: "./group-receipt-settings.component.html",
    styleUrl: "./group-receipt-settings.component.scss",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormComponent, AuditDetailSectionComponent, FormSectionComponent, CheckboxComponent, SelectComponent, UserAutocompleteComponent, StatusSelectComponent, TranslatePipe, FormGetPipe]
})
export class GroupReceiptSettingsComponent extends BaseFormComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  public originalGroup!: Group;

  public editLink: string = "";

  public canEdit = false;

  /** Who paid, when a scan does not say. The empty type is the person scanning, like Uploader. */
  public readonly paidByTypeOptions = [
    { value: QuickScanDefaultPaidByType.Uploader, display: marker("The person scanning") },
    { value: QuickScanDefaultPaidByType.User, display: marker("Always the same person") },
  ];

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder,
    private groupsService: GroupsService,
    private snackbarService: SnackbarService
  ) {
    super();
  }

  /** The member picker shows only for "Always the same person". */
  public get showPaidByUser(): boolean {
    return this.form?.get("quickScanDefaultPaidByType")?.value === QuickScanDefaultPaidByType.User;
  }

  /** Asking for a note in Quick Scan means nothing while the note is hidden for the household. */
  public get noteHidden(): boolean {
    return !!this.form?.get("hideNote")?.value;
  }

  public ngOnInit(): void {
    this.setFormConfigFromRoute(this.activatedRoute);
    this.setOriginalGroup();
    this.canEdit = this.authStore.hasGroupPermission(this.originalGroup.id, Permission.GroupUpdate, [Permission.AppGroupsUpdate]);
    // Always editable for anyone who may update (Save in the card footer), like the other settings pages.
    if (this.formConfig.mode === FormMode.view && this.canEdit) {
      this.formConfig = { ...this.formConfig, mode: FormMode.edit };
    }
    this.initForm();
  }

  private initForm(): void {
    const receiptSettings = this.originalGroup.groupReceiptSettings;
    this.form = this.formBuilder.group({
      hideImages: [receiptSettings.hideImages ?? false],
      hideReceiptCategories: [receiptSettings.hideReceiptCategories ?? false],
      hideReceiptTags: [receiptSettings.hideReceiptTags ?? false],
      hideNote: [receiptSettings.hideNote ?? false],
      quickScanNoteEnabled: [receiptSettings.quickScanNoteEnabled ?? false],
      // A household that never chose has the empty type, which means the person scanning.
      quickScanDefaultPaidByType: [receiptSettings.quickScanDefaultPaidByType || QuickScanDefaultPaidByType.Uploader],
      quickScanDefaultPaidById: [receiptSettings.quickScanDefaultPaidById ?? null],
      quickScanDefaultStatus: [receiptSettings.quickScanDefaultStatus ?? ""],
    });

    this.applyDerivedState();
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyDerivedState());

    if (this.formConfig.mode != FormMode.edit) {
      this.form.disable();
    }
  }

  /**
   * Keeps what depends on another control in step: the member is required only for "Always the same person", and
   * the Quick Scan note switch is greyed out, not cleared, while the note is hidden, so the choice comes back
   * when the note does. Runs on init and on every change.
   */
  private applyDerivedState(): void {
    setRequired(this.form.get("quickScanDefaultPaidById"), this.showPaidByUser);

    // In view mode the whole form is disabled (see initForm); never re-enable a control there.
    if (this.formConfig.mode !== FormMode.edit) {
      return;
    }

    // emitEvent: false, because this runs inside the valueChanges subscription and enable()/disable() would
    // otherwise emit again, forever.
    const noteSwitch = this.form.get("quickScanNoteEnabled");
    if (this.noteHidden) {
      noteSwitch?.disable({ emitEvent: false });
    } else {
      noteSwitch?.enable({ emitEvent: false });
    }
  }

  private setOriginalGroup(): void {
    this.originalGroup = this.activatedRoute.snapshot.data["group"];
    this.editLink = `/groups/${this.originalGroup.id}/receipt-settings/edit`;
  }

  public submit(): void {
    if (this.form.valid) {
      // getRawValue, not value: a disabled control is left out of form.value, so the Quick Scan note switch
      // greyed out by "Hide the note" would be sent as nothing and wipe the stored choice.
      const value = this.form.getRawValue();
      const namesAMember = value.quickScanDefaultPaidByType === QuickScanDefaultPaidByType.User;
      const command: UpdateGroupReceiptSettingsCommand = {
        ...value,
        // The member only counts for "Always the same person"; an empty picker yields "" or null.
        quickScanDefaultPaidById: namesAMember && value.quickScanDefaultPaidById
          ? Number(value.quickScanDefaultPaidById)
          : undefined,
      };

      this.groupsService.updateGroupReceiptSettings(this.originalGroup.id, command)
        .pipe(
          take(1),
          tap((updatedGroupReceiptSettings) => {
            this.originalGroup.groupReceiptSettings = updatedGroupReceiptSettings;
            this.groupStore.updateGroup(this.originalGroup);
          }),
          tap(() => {
            this.snackbarService.success("Receipt settings updated successfully");
            this.form.markAsPristine();
          })
        )
        .subscribe();
    }
  }
}
