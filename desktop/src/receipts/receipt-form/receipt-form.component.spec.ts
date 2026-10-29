import { HttpResponse } from "@angular/common/http";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { AppDialog } from "../../dialog/app-dialog";
import { ActivatedRoute, Router } from "@angular/router";
import { Store } from "@ngxs/store";
import { BehaviorSubject, of } from "rxjs";
import { FormMode } from "src/enums/form-mode.enum";
import { PipesModule } from "src/pipes/pipes.module";
import { RenameReceiptDialogComponent } from "../rename-receipt-dialog/rename-receipt-dialog.component";
import { ConfirmationDialogComponent } from "src/shared-ui/confirmation-dialog/confirmation-dialog.component";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { ApiModule, Permission, ReceiptImageService, ReceiptService, ReceiptStatus } from "../../open-api";
import { SnackbarService } from "../../services";
import { QueueMode } from "../../services/receipt-queue.service";
import { StatefulMenuItem } from "../../standalone/components/filtered-stateful-menu/stateful-menu-item";
import { SetPermissions } from "../../store/auth.state.actions";
import { UserAutocompleteModule } from "../../user-autocomplete/user-autocomplete.module";
import { SetGroups, SetSelectedGroupId } from "../../store/group.state.actions";
import { StoreModule } from "../../store/store.module";
import { ReceiptFormComponent } from "./receipt-form.component";

import type { Mock, MockInstance } from "vitest";
describe("ReceiptFormComponent", () => {
  let component: ReceiptFormComponent;
  let fixture: ComponentFixture<ReceiptFormComponent>;
  let routeDataSubject: BehaviorSubject<any>;

  beforeEach(async () => {
    routeDataSubject = new BehaviorSubject<any>({});
    await TestBed.configureTestingModule({
      declarations: [ReceiptFormComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [ApiModule,
        PipesModule,
        StoreModule,
        PipesModule,
        ReactiveFormsModule,
        SharedUiModule,
        UserAutocompleteModule,
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {}, queryParams: {}
            },
            data: routeDataSubject,
            params: of({})
          },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptFormComponent);
    component = fixture.componentInstance;
    component.mode = FormMode.edit;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });


  it("should init form correctly when there is no initial data", () => {
    vi.useFakeTimers();
    // Midday UTC, so "today" in the default UTC app zone is Jan 1 whatever the
    // test machine's own zone; the form holds it as that day's local midnight.
    vi.setSystemTime(new Date(Date.UTC(2020, 0, 1, 12)));
    const mockedDate = new Date(2020, 0, 1);
    component.ngOnInit();

    expect(component.form.value).toEqual({
      name: "",
      shopName: "",
      amount: "",
      categories: [],
      tags: [],
      date: mockedDate,
      paidByUserId: "",
      // "" rather than the 0 this used to seed via Number(""): both read as
      // blank in the picker, but Validators.required treats 0 as PRESENT, so
      // the old sentinel left a group-less form valid.
      groupId: "",
      status: ReceiptStatus.Open,
    });
    vi.useRealTimers();
  });

  describe("a new receipt (Phase 3 C1/C2)", () => {
    beforeEach(() => {
      const store = TestBed.inject(Store);
      store.reset({ ...store.snapshot(), auth: { ...store.snapshot().auth, userId: "5" } });
    });

    it("is named after today and paid by the user adding it, without asking", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2020, 0, 1, 12)));
      routeDataSubject.next({ mode: FormMode.add });
      vi.useRealTimers();

      expect(component.form.get("name")?.value).toEqual("Receipt 1 Jan 2020");
      expect(component.form.get("paidByUserId")?.value).toEqual(5);
      expect(component.showPaidBy()).toBe(false);
    });

    it("shakes and outlines an empty name and amount instead of silently doing nothing", async () => {
      routeDataSubject.next({ mode: FormMode.add });
      fixture.detectChanges();
      component.form.patchValue({ name: "", amount: "" });

      component.submit();

      for (const field of ["name", "amount"]) {
        const box = fixture.nativeElement.querySelector(`[data-testid="receipt-${field}"]`);
        expect(box.classList).toContain("cv-shake");
        expect(box.classList).toContain("cv-field-error");
      }
    });

    it("offers Cancel next to Save, and Cancel goes back to the receipts list without saving", () => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
      routeDataSubject.next({ mode: FormMode.add });
      fixture.detectChanges();

      const cancel = fixture.nativeElement.querySelector('[data-testid="receipt-form-cancel"]');
      expect(cancel).toBeTruthy();

      component.cancel();

      expect(navigate).toHaveBeenCalledWith([component.receiptListLink()]);
    });

    it("cancels an edit back to the receipt itself", () => {
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      routeDataSubject.next({ mode: FormMode.edit, receipt: { id: 7, name: "R", amount: "1.00", paidByUserId: 1 } as any });

      component.cancel();

      expect(navigate).toHaveBeenCalledWith(["/receipts/7/view"]);
    });

    it("asks for Paid By on a saved receipt without one", () => {
      routeDataSubject.next({
        mode: FormMode.edit,
        receipt: { id: 1, name: "R", amount: "1.00", paidByUserId: 0 } as any,
      });

      expect(component.form.get("name")?.value).toEqual("R");
      expect(component.showPaidBy()).toBe(true);
    });

    it("keeps the hidden payer when magic fill guesses another", () => {
      routeDataSubject.next({
        mode: FormMode.edit,
        receipt: { id: 1, name: "R", amount: "1.00", paidByUserId: 5 } as any,
      });
      component.images.set([{ id: 1 } as any]);
      Object.defineProperty(component, "carouselComponent", {
        value: () => ({ currentlyShownImageIndex: 0 }),
        configurable: true,
      });
      vi.spyOn(TestBed.inject(ReceiptImageService), "magicFillReceipt")
        .mockReturnValue(of({ name: "Corner Shop", paidByUserId: 9 } as any));

      component.magicFill();

      expect(component.form.get("name")?.value).toEqual("Corner Shop");
      expect(component.form.get("paidByUserId")?.value).toEqual(5);
    });
  });

  it("should patch magic fill values correctly", () => {
    component.images.set([{ id: 1 } as any]);
    component.ngOnInit();
    component.mode = FormMode.edit;
    Object.defineProperty(component, 'carouselComponent', {
      value: () => ({
        currentlyShownImageIndex: 0,
      }),
      configurable: true,
    });
    component.categories = [
      { id: 1, name: "category" } as any,
      { id: 2, name: "category2" } as any,
    ];
    component.tags = [
      { id: 1, name: "tag" } as any,
      { id: 2, name: "tag2" } as any,
    ];

    const magicReceipt = {
      name: "magic",
      amount: "482.32",
      date: "2023-08-05T00:00:00.000Z",
      categories: [{ id: 1 } as any],
      tags: [
        {
          id: 2,
        },
      ],
    } as any;

    const receiptImageServiceSpy = vi.spyOn(
      TestBed.inject(ReceiptImageService),
      "magicFillReceipt"
    ).mockReturnValue(of(magicReceipt));

    const snackbarSpy = vi.spyOn(
      TestBed.inject(SnackbarService),
      "success"
    ).mockReturnValue(undefined);

    component.magicFill();

    expect(receiptImageServiceSpy).toHaveBeenCalledWith(1, undefined);

    const receiptValue = component.form.getRawValue();

    expect(receiptValue.name).toEqual(magicReceipt.name);
    expect(receiptValue.amount).toEqual(magicReceipt.amount);
    // Midnight UTC from the API is shown as that calendar day in the picker:
    // the local midnight of Aug 5, in any browser zone.
    expect(receiptValue.date).toEqual(new Date(2023, 7, 5));
    expect(receiptValue.categories).toEqual([component.categories[0]]);
    expect(receiptValue.tags).toEqual([component.tags[1]]);
    expect(snackbarSpy).toHaveBeenCalledWith(
      "Magic fill successfully filled name, amount, date, categories, tags from selected image!",
      { duration: 10000 }
    );
  });

  it("should not patch magic fill values if they are the defaults", () => {
    component.images.set([{ id: 1 } as any]);
    component.ngOnInit();
    component.mode = FormMode.edit;
    Object.defineProperty(component, 'carouselComponent', {
      value: () => ({
        currentlyShownImageIndex: 0,
      }),
      configurable: true,
    });

    const originalData = {
      name: "a different name",
      amount: "482.32",
      date: "2023-08-05T04:09:12.316Z",
    } as any;

    component.form.patchValue(originalData);

    const magicReceipt = {
      name: "magic",
      amount: "0",
      date: "0001-01-01T00:00:00Z",
    } as any;

    const receiptImageServiceSpy = vi.spyOn(
      TestBed.inject(ReceiptImageService),
      "magicFillReceipt"
    ).mockReturnValue(of(magicReceipt));

    component.magicFill();

    expect(receiptImageServiceSpy).toHaveBeenCalledWith(1, undefined,);

    const receiptValue = component.form.getRawValue();

    expect(receiptValue.name).toEqual(magicReceipt.name);
    expect(receiptValue.amount).toEqual(originalData.amount);
    expect(receiptValue.date).toEqual(originalData.date);
  });

  it("should not patch any values when they are all default values and pop error snackbar", () => {
    component.images.set([{ id: 1 } as any]);
    component.ngOnInit();
    component.mode = FormMode.edit;
    Object.defineProperty(component, 'carouselComponent', {
      value: () => ({
        currentlyShownImageIndex: 0,
      }),
      configurable: true,
    });

    const originalData = {
      name: "a different name",
      amount: "482.32",
      date: "2023-08-05T04:09:12.316Z",
    } as any;

    component.form.patchValue(originalData);

    const magicReceipt = {
      name: "",
      amount: "0",
      date: "0001-01-01T00:00:00Z",
    } as any;

    const receiptImageServiceSpy = vi.spyOn(
      TestBed.inject(ReceiptImageService),
      "magicFillReceipt"
    ).mockReturnValue(of(magicReceipt));

    const snackbarSpy = vi.spyOn(
      TestBed.inject(SnackbarService),
      "error"
    ).mockReturnValue(undefined);

    component.magicFill();

    expect(receiptImageServiceSpy).toHaveBeenCalledWith(1, undefined);

    const receiptValue = component.form.getRawValue();

    expect(receiptValue.name).toEqual(originalData.name);
    expect(receiptValue.amount).toEqual(originalData.amount);
    expect(receiptValue.date).toEqual(originalData.date);
    expect(snackbarSpy).toHaveBeenCalledWith(
      "Could not find any values to fill! Try reuploading a clearer image."
    );
  });

  it("should set queue data when there is no data", () => {
    component.ngOnInit();

    expect(component.queueIndex).toEqual(-1);
    expect(component.queueIds).toEqual([]);
    expect(component.queueMode).toEqual(undefined);
    expect(component.submitButtonText).toEqual("Save");
  });

  it("should set queue data when there is data", () => {
    TestBed.inject(ActivatedRoute).snapshot.queryParams = {
      ids: ["1", "2", "3"],
      queueMode: QueueMode.VIEW,
    };
    routeDataSubject.next({
      receipt: { id: 2 } as any,
    });

    expect(component.queueIndex).toEqual(1);
    expect(component.queueIds).toEqual(["1", "2", "3"]);
    expect(component.queueMode).toEqual(QueueMode.VIEW);
    expect(component.submitButtonText).toEqual("Save & Next");
  });

  it("rebuilds form state when route data emits a new receipt (duplicate navigation)", () => {
    routeDataSubject.next({
      receipt: { id: 1, name: "Original", amount: "10.00" } as any,
    });

    expect(component.originalReceipt?.id).toEqual(1);
    expect(component.form.get("name")?.value).toEqual("Original");
    expect(component.editLink).toEqual("/receipts/1/edit");

    routeDataSubject.next({
      receipt: { id: 2, name: "Duplicate", amount: "10.00" } as any,
    });

    expect(component.originalReceipt?.id).toEqual(2);
    expect(component.form.get("name")?.value).toEqual("Duplicate");
    expect(component.editLink).toEqual("/receipts/2/edit");
  });

  it("sets only the total when the products card asks, and shows the new total", () => {
    routeDataSubject.next({ receipt: { id: 4, name: "Market", amount: "75.00" } as any });
    const service = TestBed.inject(ReceiptService);
    const setAmount = vi.spyOn(service, "setReceiptAmount").mockReturnValue(of({ amount: "85.00" }) as any);

    component.setTotal("85.00");

    expect(setAmount).toHaveBeenCalledWith(4, { amount: "85.00" });
    expect(component.form.get("amount")?.value).toEqual("85.00");
    expect(component.originalReceipt?.amount).toEqual("85.00");
  });

  it("changes only the date on the view page of a settled receipt", () => {
    vi.useFakeTimers();
    try {
      TestBed.inject(Store).dispatch(new SetPermissions([], { 4: [Permission.GroupReceiptsUpdate] }));
      routeDataSubject.next({
        mode: FormMode.view,
        receipt: { id: 4, groupId: 4, name: "Market", amount: "75.00", status: ReceiptStatus.Resolved, date: "2026-10-01T00:00:00Z" } as any,
      });
      const setDate = vi.spyOn(TestBed.inject(ReceiptService), "setReceiptDate").mockReturnValue(of({ date: "2026-10-21" }) as any);

      expect(component.canSetDateInPlace()).toBe(true);
      component.form.get("date")?.setValue(new Date(2026, 9, 21));
      vi.advanceTimersByTime(800);

      expect(setDate).toHaveBeenCalledTimes(1);
      expect(setDate).toHaveBeenCalledWith(4, { date: "2026-10-21" });
      expect(component.originalReceipt?.date).toEqual("2026-10-21T00:00:00Z");
      expect(component.form.get("status")?.value).toEqual(ReceiptStatus.Resolved);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the date read-only on the view page of a converted receipt or without update permission", () => {
    TestBed.inject(Store).dispatch(new SetPermissions([], { 4: [Permission.GroupReceiptsUpdate] }));
    routeDataSubject.next({ mode: FormMode.view, receipt: { id: 4, groupId: 4, amount: "75.00", originalCurrency: "PLN" } as any });
    expect(component.canSetDateInPlace()).toBe(false);

    TestBed.inject(Store).dispatch(new SetPermissions([], { 4: [Permission.GroupReceiptsRead] }));
    routeDataSubject.next({ mode: FormMode.view, receipt: { id: 5, groupId: 4, amount: "75.00" } as any });
    expect(component.canSetDateInPlace()).toBe(false);
  });

  // Full-receipt magic-fill ingest: proves the form takes in every field the
  // backend can return (paid-by, status, items, shares, custom fields, comments),
  // not just the header fields, and drops nothing on the way into the form.
  describe("magicFill — full receipt ingest", () => {
    function stubCarousel(index = 0): void {
      Object.defineProperty(component, "carouselComponent", {
        value: () => ({ currentlyShownImageIndex: index }),
        configurable: true,
      });
    }

    function stubCommentsComponent(): { addMagicFilledComments: Mock } {
      const addMagicFilledComments = vi.fn();
      Object.defineProperty(component, "receiptCommentsComponent", {
        value: () => ({ addMagicFilledComments }),
        configurable: true,
      });
      return { addMagicFilledComments };
    }

    function stubPaidByAutocomplete(): { syncSingleDisplay: Mock } {
      const syncSingleDisplay = vi.fn();
      Object.defineProperty(component, "paidByAutocomplete", {
        value: () => ({ autocompleteComponent: () => ({ syncSingleDisplay }) }),
        configurable: true,
      });
      return { syncSingleDisplay };
    }

    function mockMagicFill(magicReceipt: any): MockInstance {
      return vi
        .spyOn(TestBed.inject(ReceiptImageService), "magicFillReceipt")
        .mockReturnValue(of(magicReceipt));
    }

    function spySuccess(): MockInstance {
      return vi.spyOn(TestBed.inject(SnackbarService), "success").mockReturnValue(undefined);
    }

    function spyError(): MockInstance {
      return vi.spyOn(TestBed.inject(SnackbarService), "error").mockReturnValue(undefined);
    }


    it("ingests every field of a full magic-filled receipt", () => {
      component.images.set([{ id: 1 } as any]);
      routeDataSubject.next({ mode: FormMode.edit });
      component.mode = FormMode.edit;

      stubCarousel();
      const { addMagicFilledComments } = stubCommentsComponent();
      const { syncSingleDisplay } = stubPaidByAutocomplete();

      component.categories = [
        { id: 1, name: "category" } as any,
        { id: 2, name: "category2" } as any,
      ];
      component.tags = [
        { id: 1, name: "tag" } as any,
        { id: 2, name: "tag2" } as any,
      ];

      const magicReceipt = {
        name: "Full Receipt",
        amount: "100.00",
        date: "2023-08-05T00:00:00.000Z",
        paidByUserId: 7,
        status: ReceiptStatus.NeedsAttention,
        categories: [{ id: 1 }],
        tags: [{ id: 2 }],
        comments: [{ comment: "auto comment", userId: 7 }],
      } as any;

      mockMagicFill(magicReceipt);
      const successSpy = spySuccess();

      component.magicFill();

      const value = component.form.getRawValue();

      // Scalars
      expect(value.name).toEqual("Full Receipt");
      expect(value.amount).toEqual("100.00");
      expect(value.date).toEqual(new Date(2023, 7, 5));
      expect(value.paidByUserId).toEqual(7);
      // Shown as "To check" (Phase 3 C6).
      expect(value.status).toEqual(ReceiptStatus.Open);
      expect(syncSingleDisplay).toHaveBeenCalled();

      // Categories/tags matched from the pool by id
      expect(value.categories).toEqual([component.categories[0]]);
      expect(value.tags).toEqual([component.tags[1]]);

      // Comments handed to the (mode-aware) comments child
      expect(addMagicFilledComments).toHaveBeenCalledWith(magicReceipt.comments);

      // Snackbar lists every filled field with reader-friendly labels
      expect(successSpy).toHaveBeenCalledWith(
        "Magic fill successfully filled name, amount, date, paid by, status, categories, tags, comments from selected image!",
        { duration: 10000 }
      );
    });

    it("fills nothing and shows an error when the response is all defaults/empty", () => {
      component.images.set([{ id: 1 } as any]);
      component.ngOnInit();
      component.mode = FormMode.edit;
      stubCarousel();

      const originalData = {
        name: "kept name",
        amount: "482.32",
        paidByUserId: 3,
        status: ReceiptStatus.Open,
      } as any;
      component.form.patchValue(originalData);

      const magicReceipt = {
        name: "",
        amount: "0",
        date: "0001-01-01T00:00:00Z",
        paidByUserId: 0,
        status: "",
        categories: [],
        tags: [],
        comments: [],
      } as any;

      mockMagicFill(magicReceipt);
      const errorSpy = spyError();

      component.magicFill();

      const value = component.form.getRawValue();
      expect(value.name).toEqual("kept name");
      expect(value.amount).toEqual("482.32");
      expect(value.paidByUserId).toEqual(3);
      expect(value.status).toEqual(ReceiptStatus.Open);
      expect(errorSpy).toHaveBeenCalledWith(
        "Could not find any values to fill! Try reuploading a clearer image."
      );
    });

    it("fills only the fields present and labels just those in the snackbar", () => {
      component.images.set([{ id: 1 } as any]);
      component.ngOnInit();
      component.mode = FormMode.edit;
      stubCarousel();

      component.form.patchValue({ name: "untouched", amount: "5.00" });

      mockMagicFill({ name: "Only Name" } as any);
      const successSpy = spySuccess();

      component.magicFill();

      const value = component.form.getRawValue();
      expect(value.name).toEqual("Only Name");
      expect(value.amount).toEqual("5.00");
      expect(successSpy).toHaveBeenCalledWith(
        "Magic fill successfully filled name from selected image!",
        { duration: 10000 }
      );
    });

    it("appends magic-filled categories onto existing ones", () => {
      component.images.set([{ id: 1 } as any]);
      routeDataSubject.next({
        mode: FormMode.edit,
        receipt: {
          id: 5,
          name: "R",
          amount: "100.00",
          categories: [{ id: 1, name: "existing cat" }],
        } as any,
      });
      component.mode = FormMode.edit;
      stubCarousel();
      component.categories = [
        { id: 1, name: "existing cat" } as any,
        { id: 2, name: "new cat" } as any,
      ];

      mockMagicFill({ categories: [{ id: 2 }] } as any);
      spySuccess();

      component.magicFill();

      expect(component.form.getRawValue().categories).toEqual([
        { id: 1, name: "existing cat" },
        { id: 2, name: "new cat" },
      ]);
    });

    it("does not duplicate a category the receipt already carries", () => {
      component.images.set([{ id: 1 } as any]);
      routeDataSubject.next({
        mode: FormMode.edit,
        receipt: {
          id: 5,
          name: "R",
          amount: "100.00",
          categories: [{ id: 1, name: "existing cat" }],
        } as any,
      });
      component.mode = FormMode.edit;
      stubCarousel();
      component.categories = [{ id: 1, name: "existing cat" } as any];

      const magicReceipt = { categories: [{ id: 1 }] } as any;

      mockMagicFill(magicReceipt);
      const errorSpy = spyError();

      component.magicFill();

      // The already-present category is not appended a second time, and since
      // nothing new was added the fill reports empty (error toast).
      expect(component.form.getRawValue().categories).toEqual([
        { id: 1, name: "existing cat" },
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        "Could not find any values to fill! Try reuploading a clearer image."
      );
    });

    it("round-trips negative refund amounts on the receipt", () => {
      component.images.set([{ id: 1 } as any]);
      component.ngOnInit();
      component.mode = FormMode.edit;
      stubCarousel();

      mockMagicFill({
        name: "Refund",
        amount: "-50.00",
        date: "2023-08-05T00:00:00.000Z",
      } as any);
      spySuccess();

      component.magicFill();

      expect(component.form.getRawValue().amount).toEqual("-50.00");
    });

    it("skips paid-by when the backend returns the unset sentinel (0)", () => {
      component.images.set([{ id: 1 } as any]);
      component.ngOnInit();
      component.mode = FormMode.edit;
      stubCarousel();
      const { syncSingleDisplay } = stubPaidByAutocomplete();
      component.form.patchValue({ paidByUserId: 4 });

      const magicReceipt = {
        name: "No Payer",
        amount: "1.00",
        date: "2023-08-05T00:00:00.000Z",
        paidByUserId: 0,
      } as any;

      mockMagicFill(magicReceipt);
      const successSpy = spySuccess();

      component.magicFill();

      // Existing paid-by preserved, display not refreshed, not listed in the snackbar
      expect(component.form.getRawValue().paidByUserId).toEqual(4);
      expect(syncSingleDisplay).not.toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalledWith(
        "Magic fill successfully filled name, amount, date from selected image!",
        { duration: 10000 }
      );
    });
  });

  // The group's configured default custom fields, applied to the receipt form as
  // a "smart swap" when the group is chosen or changed.
  describe("group seeding on the add form", () => {
    let store: Store;

    const group = (id: number, isAllGroup = false): any => ({
      id,
      name: `Group ${id}`,
      isAllGroup,
      groupMembers: [],
    });

    const openAddForm = (selectedGroupId: string): void => {
      store.dispatch(new SetSelectedGroupId(selectedGroupId));
      routeDataSubject.next({ mode: FormMode.add });
    };

    beforeEach(() => {
      store = TestBed.inject(Store);
    });

    it("seeds the user's only group when the All group is the active one", () => {
      // The All group sorts first server-side, so it is what a fresh
      // single-group user lands on - and it is never a receipt target.
      store.dispatch(new SetGroups([group(1, true), group(7)]));

      openAddForm("1");

      expect(component.form.value.groupId).toEqual(7);
    });

    it("leaves the group blank when the user belongs to more than one", () => {
      store.dispatch(new SetGroups([group(1, true), group(7), group(8)]));

      openAddForm("1");

      expect(component.form.value.groupId).toEqual("");
      // Not 0: Validators.required treats 0 as present, so a 0 seed would let a
      // group-less receipt submit.
      expect(component.form.get("groupId")!.valid).toBe(false);
    });

    it("seeds the user's only group when the active selection is stale", () => {
      // selectedGroupId is persisted, so it outlives a group the user has left.
      // Number("404") is truthy, which used to skip the fallback and seed an id
      // the picker does not offer.
      store.dispatch(new SetGroups([group(1, true), group(7)]));

      openAddForm("404");

      expect(component.form.value.groupId).toEqual(7);
    });

    it("still leaves it blank on a stale selection with several groups", () => {
      store.dispatch(new SetGroups([group(1, true), group(7), group(8)]));

      openAddForm("404");

      expect(component.form.value.groupId).toEqual("");
      expect(component.form.get("groupId")!.valid).toBe(false);
    });

    it("gates add-mode permissions on the seeded group, not the browsed one", () => {
      // The All group carries its own membership, which can be missing create
      // while the user's real group has it. The gate must follow the group the
      // receipt is actually going into.
      store.dispatch(new SetGroups([group(1, true), group(7)]));
      store.dispatch(
        new SetPermissions([], { 7: [Permission.GroupReceiptsCreate] })
      );

      openAddForm("1");

      expect(component.form.value.groupId).toEqual(7);
      expect(component.canEditReceipt()).toBe(true);
    });

    it("keeps gating on the browsed group when there is no single add target", () => {
      // Multi-group user on the All group: no add target, so the gate must stay
      // on the All group exactly as before - resolving the blank seed instead
      // would deny and render the whole form read-only.
      store.dispatch(new SetGroups([group(1, true), group(7), group(8)]));
      store.dispatch(
        new SetPermissions([], { 1: [Permission.GroupReceiptsCreate] })
      );

      openAddForm("1");

      expect(component.form.value.groupId).toEqual("");
      expect(component.canEditReceipt()).toBe(true);
    });

    it("keeps the actively selected group over the sole-group fallback", () => {
      store.dispatch(new SetGroups([group(1, true), group(7)]));

      openAddForm("7");

      expect(component.form.value.groupId).toEqual(7);
    });

    it("keeps an existing receipt's own group in edit mode", () => {
      store.dispatch(new SetGroups([group(1, true), group(7)]));
      store.dispatch(new SetSelectedGroupId("1"));

      routeDataSubject.next({
        mode: FormMode.edit,
        receipt: { id: 1, name: "R", amount: "1.00", groupId: 9 } as any,
      });

      expect(component.form.value.groupId).toEqual(9);
    });
  });

  // The image stage fills its column via a class-gated height chain. The
  // fullscreen #expandedImageTemplate is declared in this component, so it
  // carries the same encapsulation attribute - it must NOT pick the class up, or
  // the dialog's plain image gets stretched too. Nothing else pins this.
  describe("image stage sizing", () => {
    const carousels = (): HTMLElement[] =>
      Array.from(document.querySelectorAll("app-carousel"));

    beforeEach(async () => {
      component.images.set([{ id: 1 } as any]);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it("has the inline carousel fill its column", () => {
      const inline = fixture.nativeElement.querySelector("app-carousel") as HTMLElement;

      expect(inline).toBeTruthy();
      expect(inline.classList).toContain("cv-carousel--fill");
      expect(inline.getAttribute("stageHeight")).toEqual("100%");
    });

    // The dialog renders its template into the overlay container, outside the
    // fixture host - which is how it is told apart from the inline one.
    const openDialogCarousel = (): HTMLElement | undefined => {
      component.expandImage();
      fixture.detectChanges();

      return carousels().find((element) => !fixture.nativeElement.contains(element));
    };

    it("gives the fullscreen dialog the same filling canvas", () => {
      const dialogCarousel = openDialogCarousel();

      expect(dialogCarousel).toBeTruthy();
      expect(dialogCarousel!.classList).toContain("cv-carousel--fill");
      expect(dialogCarousel!.getAttribute("stageHeight")).toEqual("100%");
    });

    // Without this the dialog offers no way out but Esc and the backdrop.
    it("closes the fullscreen dialog", () => {
      const dialog = TestBed.inject(AppDialog);
      openDialogCarousel();
      expect(dialog.openDialogs.length).toEqual(1);

      component.closeExpandedImage();

      expect(dialog.openDialogs.length).toEqual(0);
    });

    // The test above drives the method, so on its own it would still pass with
    // the (clicked) binding - or the whole button - deleted. This covers the
    // wiring. app-button is an unknown element under CUSTOM_ELEMENTS_SCHEMA, so
    // it renders no native button and Angular binds (clicked) as a plain DOM
    // listener on the host; dispatching the event is what the real button's
    // output does. The handler is mocked out because actually closing here runs
    // a change-detection pass this block does not stub view children for.
    it("wires the close button to closeExpandedImage", () => {
      const close = vi
        .spyOn(component, "closeExpandedImage")
        .mockImplementation(() => {});
      openDialogCarousel();

      const button = document.querySelector(
        '[data-testid="receipt-image-fullscreen-close"]',
      );

      expect(button).toBeTruthy();
      button!.dispatchEvent(new CustomEvent("clicked"));

      expect(close).toHaveBeenCalled();
    });
  });

  // The receipt page's Duplicate creates a real record, so it confirms first.
  // The image menu (Preview / Rename / Remove) replaced the lone fullscreen and delete icon buttons.
  describe("image menu actions", () => {
    let receiptService: ReceiptService;

    const stubDialog = (result: unknown) =>
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({
        componentInstance: {},
        afterClosed: () => of(result),
      } as any);

    beforeEach(() => {
      receiptService = TestBed.inject(ReceiptService);
    });

    it("renames a saved receipt on the server and updates the form and the loaded receipt", () => {
      component.mode = FormMode.edit;
      component.originalReceipt = { id: 4, name: "Lunch" } as any;
      component.form.get("name")?.setValue("Lunch");
      const rename = vi.spyOn(receiptService, "renameReceipt").mockReturnValue(of({ name: "Weekly shop" }) as any);
      const open = stubDialog("Weekly shop");

      component.renameReceipt();

      expect(open).toHaveBeenCalledWith(RenameReceiptDialogComponent, expect.anything());
      expect(rename).toHaveBeenCalledWith(4, { name: "Weekly shop" });
      expect(component.form.get("name")?.value).toEqual("Weekly shop");
      expect(component.originalReceipt?.name).toEqual("Weekly shop");
    });

    it("only fills in the name on a receipt that is not saved yet", () => {
      component.mode = FormMode.add;
      component.originalReceipt = undefined;
      const rename = vi.spyOn(receiptService, "renameReceipt");
      stubDialog("Corner shop");

      component.renameReceipt();

      expect(rename).not.toHaveBeenCalled();
      expect(component.form.get("name")?.value).toEqual("Corner shop");
    });

    it("keeps the name when the rename is cancelled", () => {
      component.mode = FormMode.edit;
      component.originalReceipt = { id: 4, name: "Lunch" } as any;
      component.form.get("name")?.setValue("Lunch");
      const rename = vi.spyOn(receiptService, "renameReceipt");
      stubDialog(undefined);

      component.renameReceipt();

      expect(rename).not.toHaveBeenCalled();
      expect(component.form.get("name")?.value).toEqual("Lunch");
    });

    it("removes the image only once the confirmation is accepted", () => {
      const remove = vi.spyOn(component, "removeImage").mockImplementation(() => {});

      stubDialog(false);
      component.confirmRemoveImage();
      expect(remove).not.toHaveBeenCalled();

      const open = stubDialog(true);
      component.confirmRemoveImage();
      expect(open).toHaveBeenCalledWith(ConfirmationDialogComponent);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("opens the preview full width on a phone", () => {
      const open = vi.spyOn(TestBed.inject(AppDialog), "open");
      const original = window.innerWidth;
      try {
        Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
        component.expandImage();
        expect(open.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ width: "100%", maxWidth: "100vw" }));
      } finally {
        Object.defineProperty(window, "innerWidth", { value: original, configurable: true });
        component.closeExpandedImage();
      }
    });
  });

  describe("duplicate confirmation", () => {
    let receiptService: ReceiptService;

    const stubDialog = (confirmed: boolean | undefined) =>
      vi.spyOn(TestBed.inject(AppDialog), "open").mockReturnValue({
        componentInstance: {},
        afterClosed: () => of(confirmed),
      } as any);

    beforeEach(() => {
      component.originalReceipt = { id: 4, name: "Lunch" } as any;
      receiptService = TestBed.inject(ReceiptService);
      vi
        .spyOn(receiptService, "duplicateReceipt")
        .mockReturnValue(of({ id: 9 }) as any);
      // The success path renders a template-driven snackbar; the template is
      // only available once the view is laid out, so stub the service call.
      vi
        .spyOn(TestBed.inject(SnackbarService), "successFromTemplate")
        .mockReturnValue({ dismiss: vi.fn() } as any);
    });

    it("duplicates the receipt once confirmed", () => {
      const open = stubDialog(true);

      component.duplicateReceipt();

      expect(open).toHaveBeenCalledWith(ConfirmationDialogComponent);
      expect(receiptService.duplicateReceipt).toHaveBeenCalledWith(4);
      expect(component.duplicatedReceiptId()).toEqual("9");
    });

    it("does nothing when the dialog is cancelled", () => {
      stubDialog(false);

      component.duplicateReceipt();

      expect(receiptService.duplicateReceipt).not.toHaveBeenCalled();
      expect(component.duplicatedReceiptId()).toEqual("");
    });

    // A backdrop click / ESC closes with undefined rather than false.
    it("does nothing when the dialog is dismissed", () => {
      stubDialog(undefined);

      component.duplicateReceipt();

      expect(receiptService.duplicateReceipt).not.toHaveBeenCalled();
    });
  });

  describe("role-required receipt fields", () => {
    let store: Store;
    let receiptService: ReceiptService;
    let receiptImageService: ReceiptImageService;
    let snackbarError: MockInstance;
    let commentCount: number;

    const group = (id: number): any => ({
      id,
      name: `Group ${id}`,
      isAllGroup: false,
      groupMembers: [],
      groupReceiptSettings: {},
    });

    const pngFile = (name: string) => new File(["x"], name, { type: "image/png" });

    const fillValidForm = (): void => {
      component.form.patchValue({
        name: "Lunch",
        amount: "12.00",
        paidByUserId: 1,
        groupId: 7,
      });
    };

    const queueComment = (text: string): void => {
      component.updateComments(
        new FormArray([
          new FormGroup({
            comment: new FormControl(text),
            userId: new FormControl(1),
            receiptId: new FormControl(null),
          }),
        ])
      );
      commentCount = 1;
    };

    beforeEach(() => {
      store = TestBed.inject(Store);
      receiptService = TestBed.inject(ReceiptService);
      receiptImageService = TestBed.inject(ReceiptImageService);
      snackbarError = vi.spyOn(TestBed.inject(SnackbarService), "error");
      vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      commentCount = 0;

      store.dispatch(new SetGroups([group(7), group(8)]));
      store.dispatch(
        new SetPermissions(
          [],
          {
            7: [Permission.GroupReceiptsCreate, Permission.GroupReceiptsUpdate],
            8: [Permission.GroupReceiptsCreate, Permission.GroupReceiptsUpdate],
          },
          { 7: { commentRequired: true, imageRequired: true } }
        )
      );

      // Neither child is declared under CUSTOM_ELEMENTS_SCHEMA; stub the two the
      // submit path and the comment check read.
      Object.defineProperty(component, "shareListComponent", {
        value: () => ({ userExpansionPanels: () => [] }),
      });
      Object.defineProperty(component, "receiptCommentsComponent", {
        value: () => ({ commentCount: () => commentCount }),
      });
      // Resolves to a bare element under CUSTOM_ELEMENTS_SCHEMA once rendered.
      Object.defineProperty(component, "paidByAutocomplete", { value: () => undefined });
    });

    const openAddForm = (): void => {
      store.dispatch(new SetSelectedGroupId("7"));
      routeDataSubject.next({ mode: FormMode.add });
    };

    const openEditForm = (receipt: any): void => {
      routeDataSubject.next({ mode: FormMode.edit, receipt });
    };

    it("creates with exactly one request carrying the files and comments", () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const createSpy = vi.spyOn(receiptService, "createReceiptWithFiles");
      const uploadSpy = vi.spyOn(receiptImageService, "uploadReceiptImage");
      openAddForm();
      fillValidForm();
      queueComment("Business lunch");
      const files = [pngFile("a.png"), pngFile("b.png")];
      component.filesToUpload.set(files.map((file) => ({ file, receiptId: 0 })));

      component.submit();

      expect(createSpy).toHaveBeenCalledTimes(1);
      const [receipt, sentFiles] = createSpy.mock.calls[0] as any[];
      expect(receipt.comments).toEqual([
        { comment: "Business lunch", userId: 1, receiptId: null },
      ]);
      expect(sentFiles).toEqual(files);

      const request = httpMock.expectOne((req) => req.url.endsWith("/receipt/withFiles"));
      expect(request.request.method).toBe("POST");
      const body = request.request.body as FormData;
      expect(body.getAll("files").length).toBe(2);
      expect(body.get("receipt")).toBeTruthy();
      request.flush({ id: 42 });

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(["/receipts/42/view"]);
      httpMock.verify();
    });

    it("still creates in one request when the group requires nothing", () => {
      store.dispatch(new SetPermissions([], { 7: [Permission.GroupReceiptsCreate] }, {}));
      const createSpy = vi
        .spyOn(receiptService, "createReceiptWithFiles")
        .mockReturnValue(of(new HttpResponse({ body: { id: 5 } })) as any);
      openAddForm();
      fillValidForm();

      component.submit();

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Lunch", groupId: 7 }),
        [],
        "events",
        true
      );
    });

    it("blocks an add-mode submit without the required image", () => {
      const createSpy = vi.spyOn(receiptService, "createReceiptWithFiles");
      openAddForm();
      fillValidForm();
      queueComment("Has a comment");

      component.submit();

      expect(component.isImageMissing()).toBe(true);
      expect(component.isCommentMissing()).toBe(false);
      expect(snackbarError).toHaveBeenCalledWith(
        "Your role requires an image on this group's receipts."
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("blocks an add-mode submit without the required comment", () => {
      const createSpy = vi.spyOn(receiptService, "createReceiptWithFiles");
      openAddForm();
      fillValidForm();
      component.filesToUpload.set([{ file: pngFile("a.png"), receiptId: 0 }]);

      component.submit();

      expect(snackbarError).toHaveBeenCalledWith(
        "Your role requires a comment on this group's receipts."
      );
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("renders the inline hints while the required fields are missing", () => {
      openAddForm();
      fillValidForm();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('[data-testid="receipt-image-required-hint"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="receipt-comment-required-hint"]')).toBeTruthy();
    });

    it("re-evaluates the requirements when the group changes", () => {
      openAddForm();
      fillValidForm();
      expect(component.isImageMissing()).toBe(true);

      component.form.get("groupId")?.setValue(8);

      expect(component.receiptRequirements()).toEqual({
        commentRequired: false,
        imageRequired: false,
      });
      expect(component.isImageMissing()).toBe(false);
      expect(component.isCommentMissing()).toBe(false);
    });

    it("checks the saved images and comments in edit mode", () => {
      const updateSpy = vi.spyOn(receiptService, "updateReceipt");
      openEditForm({ id: 3, name: "R", amount: "1.00", paidByUserId: 1, groupId: 7 });
      component.images.set([]);

      component.submit();

      expect(snackbarError).toHaveBeenCalledWith(
        "Your role requires an image and a comment on this group's receipts."
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("locks removing the last image in edit mode when an image is required", () => {
      const deleteSpy = vi.spyOn(receiptImageService, "deleteReceiptImageById");
      openEditForm({ id: 3, name: "R", amount: "1.00", paidByUserId: 1, groupId: 7 });
      component.images.set([{ id: 11 } as any]);

      expect(component.isLastImageLocked()).toBe(true);
      component.removeImage();
      expect(deleteSpy).not.toHaveBeenCalled();

      component.images.set([{ id: 11 } as any, { id: 12 } as any]);
      expect(component.isLastImageLocked()).toBe(false);
    });

    it("limits comment deletion only in edit mode when a comment is required", () => {
      openEditForm({ id: 3, name: "R", amount: "1.00", paidByUserId: 1, groupId: 7 });
      expect(component.isCommentDeletionLimited()).toBe(true);

      component.form.get("groupId")?.setValue(8);
      expect(component.isCommentDeletionLimited()).toBe(false);
    });

    it("requires nothing in view mode", () => {
      routeDataSubject.next({
        mode: FormMode.view,
        receipt: { id: 3, name: "R", amount: "1.00", groupId: 7 },
      });

      expect(component.isImageMissing()).toBe(false);
      expect(component.isCommentMissing()).toBe(false);
      expect(component.isLastImageLocked()).toBe(false);
    });
  });

  // A receipt's date and DATE custom fields are calendar days: stored as
  // midnight UTC, shown in the datepicker as that day's local midnight, and sent
  // back as midnight UTC of whatever day is picked.
  describe("calendar dates on load and submit", () => {
    let receiptService: ReceiptService;

    beforeEach(() => {
      receiptService = TestBed.inject(ReceiptService);
      vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
      // The store persists across this file; clear any role requirement an
      // earlier describe left on group 7 so submit reaches the request.
      TestBed.inject(Store).dispatch(new SetPermissions([], {}, {}));
      Object.defineProperty(component, "shareListComponent", {
        value: () => ({ userExpansionPanels: () => [] }),
      });
      Object.defineProperty(component, "receiptCommentsComponent", {
        value: () => ({ commentCount: () => 0 }),
      });
      Object.defineProperty(component, "paidByAutocomplete", { value: () => undefined });
    });

    const editReceipt = {
      id: 3,
      name: "R",
      amount: "1.00",
      paidByUserId: 1,
      groupId: 7,
      date: "2026-09-30T00:00:00Z",
    };

    it("shows a stored midnight-UTC date as that calendar day in the picker", () => {
      routeDataSubject.next({ mode: FormMode.edit, receipt: editReceipt });

      const value = component.form.getRawValue();
      expect(value.date).toEqual(new Date(2026, 8, 30));
    });

    it("sends the picked days as midnight UTC, leaving the form's Dates alone", () => {
      const updateSpy = vi
        .spyOn(receiptService, "updateReceipt")
        .mockReturnValue(of({}) as any);
      routeDataSubject.next({ mode: FormMode.edit, receipt: editReceipt });
      component.form.patchValue({ date: new Date(2026, 8, 15) });

      component.submit();

      const [, sent] = updateSpy.mock.calls[0] as any[];
      expect(sent.date).toBe("2026-09-15T00:00:00.000Z");
      expect(component.form.getRawValue().date).toEqual(new Date(2026, 8, 15));
    });

  });
});
