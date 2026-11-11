import { ChangeDetectorRef, DestroyRef, Component, ElementRef, EmbeddedViewRef, HostListener, inject, Injector, OnInit, Signal, TemplateRef, computed, runInInjectionContext, signal, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { UploadStage, withUploadProgress } from "../../utils/upload-progress";
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { ToastRef } from "../../toast/toast.service";
import { ActivatedRoute, Router } from "@angular/router";
import { isSettled } from "../../utils/receipt-status";
import { catchError, debounceTime, EMPTY, filter, finalize, forkJoin, map, of, startWith, switchMap, take, tap } from "rxjs";
import { formatDateInput, parseDateInput } from "../../datepicker/date-input.directive";
import { CarouselComponent } from "src/carousel/carousel/carousel.component";
import { DEFAULT_DIALOG_CONFIG, DEFAULT_HOST_CLASS } from "src/constants";
import { RECEIPT_STATUS_OPTIONS } from "src/constants/receipt-status-options";
import { FormMode } from "src/enums/form-mode.enum";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { LayoutStore } from "src/store/layout.store";
import { UserAutocompleteComponent } from "src/user-autocomplete/user-autocomplete/user-autocomplete.component";
import { ReceiptFileUploadCommand } from "../../interfaces";
import {
  Category,
  FileDataView,
  Group,
  Permission,
  Receipt,
  ReceiptImageService,
  ReceiptService,
  ReceiptStatus,
  Tag,
} from "../../open-api";
import { SnackbarService } from "../../services";
import { shakeInvalid } from "../../utils/shake";
import { QueueMode, ReceiptQueueService } from "../../services/receipt-queue.service";
import { FeatureConfigStore, UserStore, GroupStore, AuthStore } from "../../store";
import { SystemSettingsStore } from "../../store/system-settings.store";
import { calendarDayToLocalDate, nameForToday, todayInZone, toMidnightUtc } from "../../utils/app-time-zone";
import { downloadFile } from "../../utils/file";
import { receiptImageFileUrl } from "../../utils/receipt-image-url";
import { DEMO_MODE } from "../../demo/demo-runtime";
import { RECEIPT_NOTE_MAX_LENGTH } from "../../constants/receipt-note.constant";
import { codePointMaxLengthValidator } from "../../validators";

import { UploadImageComponent } from "../upload-image/upload-image.component";
import { marker } from "../../i18n/marker";
import { RenameReceiptDialogComponent } from "../rename-receipt-dialog/rename-receipt-dialog.component";
import { TranslationService } from "../../i18n/translation.service";
import { FormHeaderComponent } from "../../shared-ui/form-header/form-header.component";
import { FormSectionComponent } from "../../shared-ui/form-section/form-section.component";
import { NgIf } from "@angular/common";
import { AuditDetailSectionComponent } from "../../shared-ui/audit-detail-section/audit-detail-section.component";
import { InputComponent } from "../../input/input/input.component";
import { ReceiptCurrencyNoteComponent } from "../receipt-currency-note/receipt-currency-note.component";
import { DatepickerComponent } from "../../datepicker/datepicker/datepicker.component";
import { ReceiptWarrantyComponent } from "../receipt-warranty/receipt-warranty.component";
import { GroupAutocompleteComponent } from "../../shared-ui/group-autocomplete/group-autocomplete.component";
import { SelectComponent } from "../../select/select/select.component";
import { TextareaComponent } from "../../textarea/textarea/textarea.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { HlmSpinner } from "../../ui/spinner/lib/hlm-spinner";
import { CdkMenuTrigger, CdkMenu, CdkMenuItem } from "@angular/cdk/menu";
import { HlmDropdownMenuTrigger } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-trigger";
import { ReceiptProductsComponent } from "../receipt-products/receipt-products.component";
import { UploadProgressComponent } from "../../shared-ui/upload-progress/upload-progress.component";
import { FormButtonBarComponent } from "../../shared-ui/form-button-bar/form-button-bar.component";
import { CancelButtonComponent } from "../../shared-ui/cancel-button/cancel-button.component";
import { SubmitButtonComponent } from "../../shared-ui/submit-button/submit-button.component";
import { HlmDropdownMenu } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu";
import { HlmDropdownMenuFocusOnHover } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-focus-on-hover";
import { HlmDropdownMenuItem } from "../../ui/dropdown-menu/lib/hlm-dropdown-menu-item";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";
import { InputReadonlyPipe } from "../../pipes/input-readonly.pipe";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltip } from "@spartan-ng/helm/tooltip";
import { RouterLink } from "@angular/router";

/** How long a date typed on the view page waits before it is saved. */
export const DATE_IN_PLACE_DEBOUNCE_MS = 800;

@Component({
    selector: "app-receipt-form",
    templateUrl: "./receipt-form.component.html",
    styleUrls: ["./receipt-form.component.scss"],
    host: DEFAULT_HOST_CLASS,
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [ReactiveFormsModule, FormHeaderComponent, FormSectionComponent, NgIf, AuditDetailSectionComponent, InputComponent, ReceiptCurrencyNoteComponent, DatepickerComponent, ReceiptWarrantyComponent, GroupAutocompleteComponent, UserAutocompleteComponent, SelectComponent, TextareaComponent, UploadImageComponent, AppIconComponent, HlmSpinner, CarouselComponent, CdkMenuTrigger, HlmDropdownMenuTrigger, ReceiptProductsComponent, UploadProgressComponent, FormButtonBarComponent, CancelButtonComponent, SubmitButtonComponent, CdkMenu, HlmDropdownMenu, CdkMenuItem, HlmDropdownMenuFocusOnHover, HlmDropdownMenuItem, TranslatePipe, FormGetPipe, InputReadonlyPipe, HlmButton, HlmTooltip, RouterLink]
})
export class ReceiptFormComponent implements OnInit {
  private readonly authStore = inject(AuthStore);

  private readonly groupStore = inject(GroupStore);

  private readonly userStore = inject(UserStore);

  private readonly systemSettingsStore = inject(SystemSettingsStore);

  private readonly layoutStore = inject(LayoutStore);

  private readonly featureConfigStore = inject(FeatureConfigStore);

  private readonly translation = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  // base-input has no message of its own for maxlength; held as a field so the binding is stable.
  public readonly noteErrorMessages: { [key: string]: string } = {
    maxlength: marker("Note must be {requiredLength} characters or fewer."),
  };

  public readonly uploadImageComponent = viewChild.required(UploadImageComponent);

  public readonly paidByAutocomplete = viewChild<UserAutocompleteComponent>("paidByAutocomplete");

  public readonly successDuplicateSnackbar = viewChild.required<TemplateRef<any>>("successDuplicateSnackbar");

  public readonly expandedImageTemplate = viewChild.required<TemplateRef<any>>("expandedImageTemplate");

  public readonly carouselComponent = viewChild(CarouselComponent);

  public groups = this.groupStore.groupsWithoutAll;

  public receiptListLink = this.groupStore.receiptListLink;

  public aiPoweredReceipts = this.featureConfigStore.aiPoweredReceipts;

  public showProgressBar = this.layoutStore.showProgressBar;

  public userPreferences = this.authStore.userPreferences;

  protected readonly FormMode = FormMode;

  public categories: Category[] = [];

  public tags: Tag[] = [];

  // Inline category/tag creation is allowed only with the matching app create
  // permission (the receipt form otherwise restricts users to the granted set).
  public canCreateCategories = computed(() => this.authStore.hasAppPermission(Permission.AppCategoriesCreate));
  public canCreateTags = computed(() => this.authStore.hasAppPermission(Permission.AppTagsCreate));


  public originalReceipt?: Receipt;

  public images = signal<FileDataView[]>([]);

  public filesToUpload = signal<ReceiptFileUploadCommand[]>([]);

  public mode: FormMode = FormMode.view;

  public formMode = FormMode;

  protected readonly Permission = Permission;

  /**
   * Reactive gate for editing the receipt: holds `group.receipts.create` (add
   * mode) / `group.receipts.update` (view/edit mode) for the receipt's group.
   * Reassigned in `ngOnInit` once the group id + mode are known (mirrors the
   * `selectSignal` reassignment used elsewhere); deny-by-default until then.
   */
  public canEditReceipt: Signal<boolean> = signal(false);

  public canMagicFill: Signal<boolean> = signal(false);

  public canDuplicate: Signal<boolean> = signal(false);

  /** True once the receipt reads as Done; drives the "Mark as done" check on the view screen (Phase 3 2e). */
  public readonly receiptDone = signal(false);

  public selectedGroup = signal<Group | undefined>(undefined);

  // Paid By is only asked when the form opened without one (Phase 3 C1). Decided
  // once per form, so picking a payer does not make the field vanish under you.
  public readonly showPaidBy = signal(false);

  // The form's current group id (the target group in edit mode too - the server
  // checks an update against the group the receipt is moving into).
  private readonly currentGroupId = signal<number | string | null | undefined>(undefined);

  private readonly soleGroupId = this.groupStore.soleGroupId;

  // A member of one group has nothing to pick (Phase 3 C3); the picker still
  // shows when the receipt is somehow elsewhere, so it can be moved back.
  public readonly showGroupPicker = computed(
    () => this.soleGroupId() === undefined || Number(this.currentGroupId()) !== this.soleGroupId()
  );

  public editLink = "";

  public cancelLink = "";

  public submitButtonText = "Save";

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  public imagesLoading = signal(false);

  public showImages: boolean = true;

  public usersToOmit = signal<string[]>([]);

  public duplicatedReceiptId = signal("");

  public duplicatedSnackbarRef!: ToastRef;

  public formHeaderText!: Signal<string | undefined>;

  public receiptStatusOptions = RECEIPT_STATUS_OPTIONS;

  private expandedImageDialog?: AppDialogRef<unknown>;

  /** 0 when the carousel is not rendered, i.e. while images are hidden. */
  public get currentImageIndex(): number {
    return this.carouselComponent()?.currentlyShownImageIndex ?? 0;
  }

  public queueIds: string[] = [];

  public queueIndex: number = -1;

  public queueMode: QueueMode | undefined;

  constructor(
    private activatedRoute: ActivatedRoute,
    private formBuilder: FormBuilder,
    private dialog: AppDialog,
    private receiptImageService: ReceiptImageService,
    private receiptQueueService: ReceiptQueueService,
    private receiptService: ReceiptService,
    private router: Router,
    private injector: Injector,
    private snackbarService: SnackbarService
  ) {}

  /** Leaves without saving: back to the receipt when editing one, to the receipts list when adding. */
  public cancel(): void {
    if (this.mode === FormMode.edit && this.originalReceipt?.id) {
      this.router.navigate([`/receipts/${this.originalReceipt.id}/view`]);
      return;
    }

    this.router.navigate([this.receiptListLink()]);
  }

  @HostListener("window:keydown", ["$event"])
  public handleKeyboardEvent(event: KeyboardEvent): void {
    const isBodyActive = document.activeElement === document.body;
    if (event.key === "ArrowRight" && isBodyActive && this.queueIds.length > 0) {
      this.queueNext();
    } else if (event.key === "ArrowLeft" && isBodyActive && this.queueIds.length > 0) {
      this.queuePrevious();
    }
  }

  public form: FormGroup = new FormGroup({});

  public ngOnInit(): void {
    this.activatedRoute.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.duplicatedSnackbarRef?.dismiss();
        // categories/tags are sourced per-group from AppData (see
        // setCategoryTagPoolsForGroup), driven by the group-change listener.
        this.originalReceipt = data["receipt"];
        this.editLink = `/receipts/${this.originalReceipt?.id}/edit`;
        this.mode = data["mode"];
        this.setCancelLink();
        this.initForm();
        this.setReceiptPermissions();
        this.getImageFiles();
        this.setHeaderText();
        this.setQueueData();
        document.scrollingElement?.scrollTo(0, 0);
      });
  }

  private setQueueData(): void {
    this.queueIds = this.activatedRoute.snapshot.queryParams["ids"] ?? [];
    if (this.queueIds.length > 0) {
      this.queueIndex = this.queueIds.indexOf(this.originalReceipt?.id.toString() ?? "");
    }

    if (this.queueIndex != this.queueIds.length - 1) {
      this.submitButtonText = marker("Save & Next");
    }

    this.queueMode = this.activatedRoute.snapshot.queryParams["queueMode"];
  }

  private setHeaderText(): void {
    this.formHeaderText = runInInjectionContext(this.injector, () => toSignal(
      (this.form.get("name") as AbstractControl).valueChanges.pipe(
        startWith(this.form.get("name")?.value),
        takeUntilDestroyed(this.destroyRef),
        map((name) => {
          // The page title is the action, or the receipt's own name when it is only being looked at.
          switch (this.mode) {
            case FormMode.add:
              return marker("Add receipt");
            case FormMode.edit:
              return marker("Edit receipt");
            default:
              return (name ?? "").toString().trim() || marker("Receipt");
          }
        })
      )
    ));
  }

  private setCancelLink(): void {
    const selectedGroupId = this.groupStore.selectedGroupId();
    this.cancelLink = `/receipts/group/${selectedGroupId}`;
  }

  private setReceiptPermissions(): void {
    // In add mode there is no saved receipt yet, so gate against the add target -
    // the group the receipt would be created in, which is what initForm seeds and
    // what the route guard checked; otherwise gate against the receipt's own group.
    //
    // The selectedGroupId tail is load-bearing, and is the one case where the gate
    // and the seed legitimately differ: a multi-group user browsing the "All"
    // group has no add target, so the form is seeded blank (they must pick) while
    // the gate stays on the All group, which carries real permissions, exactly as
    // before. Gating on that blank seed instead would resolve NaN, and
    // hasGroupPermission would deny - rendering the whole add form read-only.
    const groupId =
      this.mode === FormMode.add
        ? (this.groupStore.addTargetGroupId() ??
          Number.parseInt(this.groupStore.selectedGroupId()))
        : (this.originalReceipt?.groupId ?? 0);
    const editPermission =
      this.mode === FormMode.add
        ? Permission.GroupReceiptsCreate
        : Permission.GroupReceiptsUpdate;

    this.canEditReceipt = computed(() => this.authStore.hasGroupPermission(groupId, editPermission));
    this.canMagicFill = computed(() => this.authStore.hasGroupPermission(groupId, Permission.GroupReceiptsMagicFill));
    this.canDuplicate = computed(() => this.authStore.hasGroupPermission(groupId, Permission.GroupReceiptsDuplicate));
  }

  /** "Looks right" under the lines on the view screen: settles the receipt without opening the edit form. */
  public markDone(): void {
    const receiptId = this.originalReceipt?.id;
    if (!receiptId) {
      return;
    }

    this.receiptService
      .bulkReceiptStatusUpdate({ status: ReceiptStatus.Resolved, receiptIds: [receiptId] })
      .pipe(take(1))
      .subscribe(() => {
        this.form.patchValue({ status: ReceiptStatus.Resolved });
        if (this.originalReceipt) {
          this.originalReceipt.status = ReceiptStatus.Resolved;
        }
        this.receiptDone.set(true);
        this.snackbarService.success("Marked as settled");
      });
  }

  /** The products card's "Set total to …": changes only the total, without opening the edit form. */
  public setTotal(amount: string): void {
    const receiptId = this.originalReceipt?.id;
    if (!receiptId) {
      return;
    }

    this.receiptService
      .setReceiptAmount(receiptId, { amount })
      .pipe(take(1))
      .subscribe(() => {
        this.form.patchValue({ amount });
        if (this.originalReceipt) {
          this.originalReceipt = { ...this.originalReceipt, amount };
        }
        this.changeDetectorRef.markForCheck();
        this.snackbarService.success("Total updated");
      });
  }

  /**
   * The view page changes the date in place, settled or not (settling is a status, not a lock). Not for a receipt
   * converted from another currency: its rate belongs to the day it was added, so that goes through Edit.
   */
  public canSetDateInPlace(): boolean {
    return this.mode === FormMode.view && this.canEditReceipt() && !this.originalReceipt?.originalCurrency;
  }

  /**
   * Saves a date changed on the view page with `setReceiptDate` (only the date, like Set total to …). A day picked from
   * the calendar is final; a typed one waits for a pause, since every complete day typed is a change of its own.
   */
  private listenForDateChangesInPlace(): void {
    const receiptId = this.originalReceipt?.id;
    if (!receiptId) {
      return;
    }

    let savedDay = formatDateInput(calendarDayToLocalDate(this.originalReceipt?.date));
    const control = this.form.get("date");
    control?.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        filter((value): value is Date => value instanceof Date && this.canSetDateInPlace()),
        debounceTime(DATE_IN_PLACE_DEBOUNCE_MS),
        map((value) => formatDateInput(value)),
        filter((day) => !!day && day !== savedDay),
        switchMap((day) =>
          this.receiptService.setReceiptDate(receiptId, { date: day }).pipe(
            map(() => day),
            // The interceptor toasts the error; the field goes back to the day that is stored.
            catchError(() => {
              control.setValue(parseDateInput(savedDay), { emitEvent: false });
              return EMPTY;
            })
          )
        )
      )
      .subscribe((day) => {
        savedDay = day;
        if (this.originalReceipt) {
          this.originalReceipt = { ...this.originalReceipt, date: `${day}T00:00:00Z` };
        }
        this.changeDetectorRef.markForCheck();
        this.snackbarService.success("Date updated");
      });
  }

  private initForm(): void {
    this.receiptDone.set(isSettled(this.originalReceipt?.status));

    // The group being browsed, or -- when that is not a receipt target (the "All"
    // group, nothing selected, or a stale persisted id) -- the user's only group.
    //
    // The empty-string fallback is deliberate and must not be "modernised" to 0:
    // Validators.required calls isEmptyInputValue, which treats 0 as PRESENT
    // (only null/undefined and zero-length string/array count as empty), so a 0
    // seed would make a group-less form valid and POST groupId: 0. It is also
    // the value app-autocomplete filters its option list by, and "0" matches only
    // groups whose name contains a zero.
    const addTargetGroupId: number | string =
      this.groupStore.addTargetGroupId() ?? "";

    // A family member never types a name or who paid (Phase 3 C1/C2): a new
    // receipt is "Receipt {today}" (magic fill replaces it with the store name)
    // and paid by whoever is adding it. An unknown user id stays blank, so the
    // Paid By field shows and asks rather than posting 0.
    const timeZone = this.systemSettingsStore.timeZone();
    const currentUserId = Number(this.authStore.userId()) || "";
    const isAdd = this.mode === FormMode.add && !this.originalReceipt;

    this.form = this.formBuilder.group({
      name: [
        this.originalReceipt?.name ?? (isAdd ? nameForToday("Receipt", timeZone) : ""),
        Validators.required,
      ],
      shopName: [this.originalReceipt?.shopName ?? ""],
      amount: [
        this.originalReceipt?.amount ?? "",
        [Validators.required],
      ],
      categories: this.formBuilder.array(
        this.originalReceipt?.categories ?? []
      ),
      tags: this.formBuilder.array(this.originalReceipt?.tags ?? []),
      // A calendar day: stored as midnight UTC, shown in the datepicker as the
      // local midnight of that UTC day. A new receipt defaults to the app zone's
      // today, not the browser's.
      date: [
        calendarDayToLocalDate(this.originalReceipt?.date) ??
          todayInZone(timeZone),
        Validators.required,
      ],
      paidByUserId: [
        this.originalReceipt?.paidByUserId ?? (isAdd ? currentUserId : ""),
        Validators.required,
      ],
      groupId: [
        this.originalReceipt?.groupId ?? addTargetGroupId,
        Validators.required,
      ],
      status: this.originalReceipt?.status || ReceiptStatus.Open,
      // Counted in characters like the server does (Validators.maxLength counts UTF-16 units).
      note: [this.originalReceipt?.note ?? "", codePointMaxLengthValidator(RECEIPT_NOTE_MAX_LENGTH)],
    });

    if (this.mode === FormMode.view) {
      this.form.get("status")?.disable();
      this.listenForDateChangesInPlace();
    }

    this.showPaidBy.set(!this.form.get("paidByUserId")?.value);

    this.listenForGroupChanges();
  }

  // Source the category/tag pickers from the selected group's AppData catalog
  // (filtered to the user's grants by the backend). No group selected -> empty.
  private setCategoryTagPoolsForGroup(groupId: number | string | null | undefined): void {
    const numericGroupId = Number(groupId);
    if (!groupId || Number.isNaN(numericGroupId)) {
      this.categories = [];
      this.tags = [];
      return;
    }
    this.categories = this.authStore.groupCategories(numericGroupId);
    this.tags = this.authStore.groupTags(numericGroupId);
  }

  private listenForGroupChanges(): void {
    this.form
      .get("groupId")
      ?.valueChanges.pipe(
      takeUntilDestroyed(this.destroyRef),
      startWith(this.form.get("groupId")?.value),
      tap((groupId) => {
        this.currentGroupId.set(groupId);
        this.setCategoryTagPoolsForGroup(groupId);
        const paidBy = this.form.get("paidByUserId");
        const users = this.userStore.users();
        if (!groupId) {
          this.usersToOmit.set(users.map((u) => u.id.toString()));
          this.paidByAutocomplete()?.autocompleteComponent()?.clearFilter();
        } else {
          const group = this.groupStore.getGroupById(groupId);
          const groupMembers = group?.groupMembers.map((u) =>
            u.userId.toString()
          );
          this.selectedGroup.set(group);
          this.usersToOmit.set(users
            .filter((u) => !groupMembers?.includes(u.id.toString()))
            .map((u) => u.id.toString()));
        }

      })
    )
      .subscribe();
  }

  /**
   * The receipt's photos. Each is shown straight from the server's image file (`/receiptImage/{id}/file`), which the
   * browser fetches, shows as it arrives and keeps, so opening the receipt again costs nothing. They used to be read
   * as base64 inside JSON, a third larger, on every visit. The demo has no server to fetch a file from, so it still
   * reads its pictures through the client.
   */
  private getImageFiles(): void {
    const files = this.originalReceipt?.imageFiles ?? [];
    if (files.length > 0 && !DEMO_MODE) {
      this.images.set(
        files.map((file) => ({
          id: file.id,
          name: file.name ?? "",
          createdAt: file.createdAt ?? "",
          encodedImage: receiptImageFileUrl(this.receiptImageService.configuration.basePath, file.id),
        }))
      );
      return;
    }

    if (
      this.originalReceipt?.imageFiles &&
      this.originalReceipt?.imageFiles?.length > 0
    ) {
      this.imagesLoading.set(true);
      forkJoin(
        this.originalReceipt.imageFiles.map((file) =>
          this.receiptImageService.getReceiptImageById(file.id).pipe(
            catchError(() => of(null))
          )
        )
      )
        .pipe(
          tap((allImages) => {
            this.images.set(allImages.filter((img): img is FileDataView => img !== null));
          }),
          finalize(() => this.imagesLoading.set(false))
        )
        .subscribe();
    }
  }

  public removeImage(): void {
    const index = this.currentImageIndex;

    if (this.mode === FormMode.add) {
      const newImages = Array.from(this.filesToUpload());
      newImages.splice(index, 1);
      this.filesToUpload.set(newImages);
    } else {
      const newImages = Array.from(this.images());
      const image = this.images()[index];
      this.receiptImageService
        .deleteReceiptImageById(image.id)
        .pipe(
          tap(() => {
            newImages.splice(index, 1);
            this.images.set(newImages);
            this.snackbarService.success("Image successfully removed");
          })
        )
        .subscribe();
    }
  }

  /** Remove from the image menu: asks first, since a stored image is deleted on the spot. */
  public confirmRemoveImage(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Remove Image");
    dialogRef.componentInstance.confirmText = marker("Remove");
    dialogRef.componentInstance.dialogContent = marker("Are you sure you would like to remove this image?");

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.removeImage();
        }
      });
  }

  /** Rename from the image menu: a new receipt just takes the name, a saved one is renamed on the server at once. */
  public renameReceipt(): void {
    const dialogRef = this.dialog.open(RenameReceiptDialogComponent, DEFAULT_DIALOG_CONFIG);
    dialogRef.componentInstance.name = String(this.form.get("name")?.value ?? "");

    dialogRef
      .afterClosed()
      .pipe(take(1))
      .subscribe((newName?: string) => {
        if (newName) {
          this.applyRename(newName);
        }
      });
  }

  private applyRename(name: string): void {
    const receiptId = this.originalReceipt?.id;
    if (this.mode === FormMode.add || !receiptId) {
      this.form.get("name")?.setValue(name);
      return;
    }

    this.receiptService
      .renameReceipt(receiptId, { name })
      .pipe(take(1))
      .subscribe((saved) => {
        this.form.get("name")?.setValue(saved.name);
        if (this.originalReceipt) {
          this.originalReceipt.name = saved.name;
        }
        this.snackbarService.success(marker("Receipt renamed"));
      });
  }

  public magicFill(): void {
    const index = this.currentImageIndex;

    let file: Blob | undefined;
    let receiptImageId;

    if (this.mode === FormMode.add) {
      file = this.filesToUpload()[index].file;
    } else if (this.mode === FormMode.edit) {
      const receiptImage = this.images()[index];
      receiptImageId = receiptImage?.id;
    }

    this.layoutStore.showProgress();
    this.receiptImageService
      .magicFillReceipt(receiptImageId, file)
      .pipe(
        take(1),
        tap((magicFilledReceipt) => {
          this.patchMagicValues(magicFilledReceipt);
          // Patched values are changes to save, so Save stops being dimmed.
          this.form.markAsDirty();
        }),
        finalize(() => this.layoutStore.hideProgress())
      )
      .subscribe();
  }

  private patchMagicValues(magicReceipt: Receipt): void {
    // A field is only reported as filled when it actually changes the form, so
    // an empty/unmatched value never claims a phantom fill. Scalars come first,
    // then each association through the form's existing builders (amount is
    // patched before items so item validators see the filled receipt total).
    const filledKeys: string[] = [];

    this.patchMagicScalars(magicReceipt, filledKeys);

    if (
      this.handleCategoryAndTagMagicFill(
        "categories",
        magicReceipt?.categories ?? [],
        this.categories
      )
    ) {
      filledKeys.push("categories");
    }
    if (
      this.handleCategoryAndTagMagicFill(
        "tags",
        magicReceipt?.tags ?? [],
        this.tags
      )
    ) {
      filledKeys.push("tags");
    }
    this.showMagicFillResult(filledKeys);
  }

  // Patches the scalar fields. Each is skipped when the backend value is unset:
  // the `value && value !== default` guard covers both the falsy sentinels
  // (name "", paidByUserId 0, status "") and the truthy ones (amount "0", the
  // zero date). status routes through the default branch.
  private patchMagicScalars(magicReceipt: Receipt, filledKeys: string[]): void {
    const keysWithDefaults = {
      name: "",
      amount: "0",
      date: "0001-01-01T00:00:00Z",
      paidByUserId: 0,
      status: "",
    } as any;
    Object.keys(keysWithDefaults).forEach((key) => {
      // A hidden Paid By already holds the user adding the receipt (C1); the AI
      // cannot know better who paid.
      if (key === "paidByUserId" && !this.showPaidBy()) {
        return;
      }

      let value = (magicReceipt as any)[key] as string | Date;
      if (value && value !== keysWithDefaults[key]) {
        switch (key) {
          case "date":
            this.form.patchValue({
              date: this.handleDateMagicFill(value as string),
            });
            break;
          case "paidByUserId":
            this.patchMagicValue(key, magicReceipt);
            // patchValue updates the control but not the autocomplete's shown
            // text, which is seeded from the control only once on init.
            this.paidByAutocomplete()?.autocompleteComponent()?.syncSingleDisplay();
            break;
          default:
            this.patchMagicValue(key, magicReceipt);
        }

        filledKeys.push(key);
      }
    });
  }

  private showMagicFillResult(filledKeys: string[]): void {
    if (filledKeys.length === 0) {
      this.snackbarService.error(
        "Could not find any values to fill! Try reuploading a clearer image."
      );
      return;
    }

    // Map the raw form keys of the added fields to reader-friendly labels; the
    // existing scalar keys map to themselves.
    const labels: { [key: string]: string } = {
      paidByUserId: "paid by",
    };
    const filledLabels = filledKeys.map((key) => labels[key] ?? key);
    const successString = `Magic fill successfully filled ${filledLabels.join(
      ", "
    )} from selected image!`;
    this.snackbarService.success(successString, {
      duration: 10000,
    });
  }

  private patchMagicValue(key: string, magicReceipt: Receipt): void {
    this.form.patchValue({ [key]: (magicReceipt as any)[key] });
  }

  private handleDateMagicFill(value: string): Date | null {
    return this.formatMagicFilledDate(value);
  }

  // Appends the magic-filled categories/tags that resolve to an entry in the
  // available pool and aren't already on the receipt (edit mode can re-return an
  // existing selection, which the picker itself would dedupe). Returns whether
  // any were added, so an empty/unmatched/all-duplicate response doesn't report a
  // phantom fill.
  private handleCategoryAndTagMagicFill(
    formKey: "categories" | "tags",
    value: Category[] | Tag[],
    arrayToFilter: Category[] | Tag[]
  ): boolean {
    const itemsFormArray = this.form.get(formKey) as FormArray;
    const existingIds = new Set(
      itemsFormArray.controls.map((control) => control.value?.id)
    );
    const magicIds = value.map((foundItem) => foundItem.id);
    const itemsToPush = (arrayToFilter as any[]).filter(
      (item) => magicIds.includes(item.id) && !existingIds.has(item.id)
    );
    itemsToPush.forEach((c) => {
      itemsFormArray.push(this.formBuilder.control(c));
    });
    return itemsToPush.length > 0;
  }

  // Magic fill returns the date as midnight UTC of the day it read, so it
  // becomes the datepicker's local midnight of that UTC day — the same
  // conversion a saved receipt's date gets on load.
  private formatMagicFilledDate(date: string): Date | null {
    return calendarDayToLocalDate(date);
  }

  public uploadImageButtonClicked(): void {
    this.uploadImageComponent().clickInput();
  }

  public duplicateReceipt(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent);

    dialogRef.componentInstance.headerText = marker("Duplicate Receipt");
    dialogRef.componentInstance.dialogContent = this.translation.t("Are you sure you would like to duplicate the receipt {name}?", { name: this.originalReceipt?.name });
    dialogRef.componentInstance.confirmText = marker("Duplicate");

    dialogRef
      .afterClosed()
      .pipe(
        take(1),
        tap((confirmed) => {
          if (confirmed) {
            this.receiptService
              .duplicateReceipt(this.originalReceipt?.id as number)
              .pipe(
                take(1),
                tap((r: Receipt) => {
                  this.duplicatedReceiptId.set(r.id.toString());
                  this.duplicatedSnackbarRef = this.snackbarService.successFromTemplate(
                    this.successDuplicateSnackbar(),
                    { duration: 8000 }
                  );
                })
              )
              .subscribe();
          }
        })
      )
      .subscribe();
  }

  public imageFileLoaded(command: ReceiptFileUploadCommand): void {
    switch (this.mode) {
      case FormMode.add:
        this.filesToUpload.update(files => [...files, command]);
        break;
      case FormMode.edit:
        this.receiptImageService
          .uploadReceiptImage(
            command.file,
            this.originalReceipt?.id as number,
            ""
          )
          .pipe(
            tap((data) => {
              this.snackbarService.success("Images uploaded");
              this.images.update(imgs => [...imgs, data]);
              })
          )
          .subscribe();
        break;

      default:
        break;
    }
  }

  public closeSuccessDuplicateSnackbar(): void {
    this.duplicatedSnackbarRef.dismiss();
  }

  public toggleShowImages(): void {
    this.showImages = !this.showImages;
  }

  public zoomImageIn(): void {
    this.carouselComponent()?.zoomIn();
  }

  public zoomImageOut(): void {
    this.carouselComponent()?.zoomOut();
  }

  public expandImage(): void {
    // No maxHeight on purpose: leaving it undefined is what puts the CDK on its
    // flush-vertical path, giving the pane the full viewport height the canvas
    // stage then fills. Setting one silently re-centres the dialog.
    this.expandedImageDialog = this.dialog.open(this.expandedImageTemplate(), {
      // Full width on a phone, where 75% would leave an unusable sliver around the photo.
      width: window.innerWidth < 768 ? "100%" : "75%",
      maxWidth: "100vw",
      height: "100%",
      // The close button is the only tabbable control, so the default
      // "first-tabbable" focus opens the viewer with a focus ring drawn around
      // it, which reads as a selected button over the image.
      autoFocus: "dialog",
    });
  }

  public closeExpandedImage(): void {
    this.expandedImageDialog?.close();
  }

  // TODO: Add functionality to dashboard
  public downloadImage(): void {
    const currentImage = this.images()[this.currentImageIndex];
    this.receiptImageService.downloadReceiptImageById(currentImage.id)
      .pipe(
        take(1),
        tap((blob) => {
          downloadFile(blob, currentImage.name);
        })
      )
      .subscribe();
  }

  public queueNext(): void {
    if (this.queueIndex < this.queueIds.length - 1) {
      this.receiptQueueService.queueNext(this.queueIndex, this.queueIds, this.queueMode ?? QueueMode.VIEW,);
    }
  }

  public queuePrevious(): void {
    if (this.queueIndex > 0) {
      this.receiptQueueService.queuePrevious(this.queueIndex, this.queueIds, this.queueMode ?? QueueMode.VIEW,);
    }
  }

  public submit(): void {
    if (this.form.invalid) {
      // Say why nothing happened: a required box that is empty shakes and is outlined in red (amount first,
      // so the cursor ends in the name).
      this.form.markAllAsTouched();
      for (const field of ["amount", "name"]) {
        if (this.form.get(field)?.invalid) {
          shakeInvalid(this.host.nativeElement.querySelector(`[data-testid="receipt-${field}"]`));
        }
      }
      return;
    }

    if (this.originalReceipt) {
      this.updateReceipt();
    } else if (this.mode === FormMode.add) {
      this.createReceipt();
    }
  }

  // The form value as it goes on the wire. The receipt's date is
  // a calendar day, sent as midnight UTC of the day picked
  // ("2026-09-30T00:00:00.000Z") rather than the datepicker's local midnight,
  // which is a different UTC day east of Greenwich. Converted on a copy, never
  // in the form, so the datepickers keep their local Dates.
  private buildSubmitCommand(): any {
    const value = this.form.value;

    return {
      ...value,
      date: value.date ? toMidnightUtc(value.date) : value.date,
    };
  }

  // One multipart call carries the receipt (its note is on the form value)
  // and its queued images, so the server sees the images at create time and the
  // create is atomic - there is no "receipt added but images failed" state.
  private createReceipt(): void {
    if (this.uploadStage() !== null) {
      return;
    }

    this.uploadStage.set({ stage: "uploading", percent: 0 });
    withUploadProgress(
      this.receiptService.createReceiptWithFiles(
        this.buildSubmitCommand(),
        this.filesToUpload().map((file) => file.file),
        "events",
        true
      ),
      (stage) => this.uploadStage.set(stage)
    )
      .pipe(
        take(1),
        tap((r: Receipt) => {
          this.snackbarService.success("Successfully added receipt");
          this.router.navigate([`/receipts/${r.id}/view`]);
        }),
        finalize(() => this.uploadStage.set(null))
      )
      .subscribe({ error: () => undefined });
  }

  /** Where the receipt upload stands (percent, then saving); null while nothing is being sent. */
  public readonly uploadStage = signal<UploadStage | null>(null);

  private updateReceipt(): void {
    this.receiptService
      .updateReceipt(this.originalReceipt?.id as number, this.buildSubmitCommand())
      .pipe(
        take(1),
        tap(() => {
          this.snackbarService.success("Successfully updated receipt");

          if (this.queueIndex === -1) {
            this.router.navigate([`/receipts/${this.originalReceipt?.id}/view`]);
          } else if (this.queueIndex >= 0 && this.queueIndex !== this.queueIds.length - 1) {
            this.queueNext();
          } else if (this.queueIndex === this.queueIds.length - 1) {
            this.snackbarService.success("Successfully updated receipt. Congratulations! You have reached the end of the queue.");
          }
        })
      )
      .subscribe();
  }
}
