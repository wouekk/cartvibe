import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { of } from "rxjs";
import { FormMode } from "../../enums/form-mode.enum";
import { GroupsService, Permission, QuickScanDefaultPaidByType, ReceiptStatus } from "../../open-api";
import { PipesModule } from "../../pipes/index";
import { SnackbarService } from "../../services";
import { SharedUiModule } from "../../shared-ui/shared-ui.module";
import { SetPermissions } from "../../store/auth.state.actions";
import { StoreModule } from "../../store/store.module";
import { GroupReceiptSettingsComponent } from "./group-receipt-settings.component";

describe("GroupReceiptSettingsComponent", () => {
  let component: GroupReceiptSettingsComponent;
  let fixture: ComponentFixture<GroupReceiptSettingsComponent>;
  let httpTestingController: HttpTestingController;

  const storedSettings = {
    hideImages: true,
    hideReceiptCategories: false,
    hideReceiptTags: true,
    hideNote: false,
    quickScanNoteEnabled: false,
    quickScanDefaultPaidByType: QuickScanDefaultPaidByType.Empty,
    quickScanDefaultPaidById: null,
    quickScanDefaultStatus: "",
  };

  const buildGroup = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    groupReceiptSettings: { ...storedSettings, ...overrides },
  });

  interface TestBedOptions {
    group?: any;
    appPermissions?: string[];
  }

  const configureTestBed = async (mode: FormMode = FormMode.edit, options: TestBedOptions = {}) => {
    await TestBed.configureTestingModule({
      declarations: [GroupReceiptSettingsComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [SharedUiModule, StoreModule, PipesModule],
      providers: [
        FormBuilder,
        GroupsService,
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        Store,
        SnackbarService,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {
                formConfig: { mode },
                group: options.group ?? buildGroup(),
              },
            },
          },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
    // Permissions must land before the first change-detection pass: ngOnInit reads them once.
    TestBed.inject(Store).dispatch(new SetPermissions(options.appPermissions ?? [], {}));
    fixture = TestBed.createComponent(GroupReceiptSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const spyOnSave = () => {
    const groupsService = TestBed.inject(GroupsService);
    const store = TestBed.inject(Store);
    const save = vi.spyOn(groupsService, "updateGroupReceiptSettings").mockReturnValue(of(storedSettings as any));
    vi.spyOn(store, "dispatch").mockReturnValue(of(undefined));
    return save;
  };

  beforeEach(async () => {
    await configureTestBed();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("fills the form from the household's settings, with the person scanning for a household that never chose", () => {
    expect(component.form.getRawValue()).toEqual({
      ...storedSettings,
      quickScanDefaultPaidByType: QuickScanDefaultPaidByType.Uploader,
    });
    expect(component.editLink).toBe("/groups/1/receipt-settings/edit");
  });

  it("holds the eight settings and none of the removed Quick Scan switches", () => {
    expect(Object.keys(component.form.controls).sort()).toEqual([
      "hideImages",
      "hideNote",
      "hideReceiptCategories",
      "hideReceiptTags",
      "quickScanDefaultPaidById",
      "quickScanDefaultPaidByType",
      "quickScanDefaultStatus",
      "quickScanNoteEnabled",
    ]);
  });

  it("saves the settings and settles the form", () => {
    const snackbarService = TestBed.inject(SnackbarService);
    vi.spyOn(snackbarService, "success");
    const save = spyOnSave();

    component.form.patchValue({ quickScanNoteEnabled: true, quickScanDefaultStatus: ReceiptStatus.Resolved });
    component.form.markAsDirty();
    component.submit();

    expect(save).toHaveBeenCalledWith(1, {
      ...storedSettings,
      quickScanNoteEnabled: true,
      quickScanDefaultPaidByType: QuickScanDefaultPaidByType.Uploader,
      // No member is named for "The person scanning", so the nullable id is left out.
      quickScanDefaultPaidById: undefined,
      quickScanDefaultStatus: ReceiptStatus.Resolved,
    });
    expect(snackbarService.success).toHaveBeenCalledWith("Receipt settings updated successfully");
    // Always editable: saving settles the form instead of leaving for a view page.
    expect(component.form.pristine).toBe(true);
  });

  it("asks for a member only for \"Always the same person\"", () => {
    expect(component.showPaidByUser).toBe(false);
    expect(component.form.valid).toBe(true);

    component.form.patchValue({ quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User });

    expect(component.showPaidByUser).toBe(true);
    expect(component.form.get("quickScanDefaultPaidById")?.valid).toBe(false);

    component.form.patchValue({ quickScanDefaultPaidById: 5 });
    expect(component.form.get("quickScanDefaultPaidById")?.valid).toBe(true);
  });

  it("does not save while \"Always the same person\" names nobody", () => {
    const save = spyOnSave();

    component.form.patchValue({ quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User });
    component.submit();

    expect(save).not.toHaveBeenCalled();
  });

  it("sends the member as a number, and only for \"Always the same person\"", () => {
    const save = spyOnSave();

    component.form.patchValue({ quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User, quickScanDefaultPaidById: "7" });
    component.submit();
    expect(save).toHaveBeenLastCalledWith(1, expect.objectContaining({
      quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User,
      quickScanDefaultPaidById: 7,
    }));

    // Back to the person scanning: the member left in the control is not sent.
    component.form.patchValue({ quickScanDefaultPaidByType: QuickScanDefaultPaidByType.Uploader });
    component.submit();
    expect(save).toHaveBeenLastCalledWith(1, expect.objectContaining({
      quickScanDefaultPaidByType: QuickScanDefaultPaidByType.Uploader,
      quickScanDefaultPaidById: undefined,
    }));
  });

  it("opens with the stored member and status", async () => {
    TestBed.resetTestingModule();
    await configureTestBed(FormMode.edit, {
      group: buildGroup({
        quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User,
        quickScanDefaultPaidById: 4,
        quickScanDefaultStatus: ReceiptStatus.Resolved,
      }),
    });

    expect(component.showPaidByUser).toBe(true);
    expect(component.form.getRawValue()).toEqual(expect.objectContaining({
      quickScanDefaultPaidByType: QuickScanDefaultPaidByType.User,
      quickScanDefaultPaidById: 4,
      quickScanDefaultStatus: ReceiptStatus.Resolved,
    }));
  });

  it("greys out the Quick Scan note switch while the note is hidden, and keeps its value", () => {
    component.form.patchValue({ quickScanNoteEnabled: true });
    component.form.patchValue({ hideNote: true });

    expect(component.noteHidden).toBe(true);
    expect(component.form.get("quickScanNoteEnabled")?.disabled).toBe(true);
    // Disabled, not cleared: the choice comes back when the note does.
    expect(component.form.getRawValue().quickScanNoteEnabled).toBe(true);

    component.form.patchValue({ hideNote: false });

    expect(component.form.get("quickScanNoteEnabled")?.disabled).toBe(false);
    expect(component.form.get("quickScanNoteEnabled")?.value).toBe(true);
  });

  it("still sends the greyed-out note switch, so hiding the note does not wipe the choice", () => {
    const save = spyOnSave();

    component.form.patchValue({ quickScanNoteEnabled: true });
    component.form.patchValue({ hideNote: true });
    component.submit();

    expect(save).toHaveBeenCalledWith(1, expect.objectContaining({ hideNote: true, quickScanNoteEnabled: true }));
  });

  it("explains the greyed-out switch on the page", async () => {
    const text = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid="quick-scan-note-hidden-hint"]');
    expect(text()).toBeNull();

    component.form.patchValue({ hideNote: true });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text()).not.toBeNull();
  });

  it("leaves the whole form disabled for someone who may not change the household", async () => {
    // initForm disables the form after subscribing to valueChanges, and that disable emits: the derived state
    // must not switch a control back on for a reader.
    TestBed.resetTestingModule();
    await configureTestBed(FormMode.view);

    expect(component.canEdit).toBe(false);
    expect(component.form.disabled).toBe(true);
    expect(component.form.get("quickScanNoteEnabled")?.disabled).toBe(true);
  });

  it("is editable straight away for someone who may change the household", async () => {
    TestBed.resetTestingModule();
    await configureTestBed(FormMode.view, { appPermissions: [Permission.AppGroupsUpdate] });

    expect(component.canEdit).toBe(true);
    expect(component.form.enabled).toBe(true);
  });
});
