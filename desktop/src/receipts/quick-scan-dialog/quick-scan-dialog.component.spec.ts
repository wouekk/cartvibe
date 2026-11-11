import { Subject } from "rxjs";
import { HttpErrorResponse, HttpEvent, HttpEventType } from "@angular/common/http";
import { HttpResponse } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { CUSTOM_ELEMENTS_SCHEMA } from "@angular/core";
import { ComponentFixture, TestBed, } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { AppDialog, AppDialogRef } from "../../dialog/app-dialog";
import { ActivatedRoute } from "@angular/router";
import { NgxsModule, Store } from "@ngxs/store";
import { of } from "rxjs";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { LayoutState } from "src/store/layout.state";
import { RECEIPT_NOTE_MAX_LENGTH } from "../../constants/receipt-note.constant";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { ApiModule, ReceiptService, ReceiptStatus } from "../../open-api";
import { PipesModule } from "../../pipes";
import { SnackbarService } from "../../services";
import { QueuedScanService } from "../../services/queued-scan.service";
import { AuthState, GroupState } from "../../store";
import { QuickScanDialogComponent } from "./quick-scan-dialog.component";
import { provideHttpClient, withInterceptorsFromDi } from "@angular/common/http";

describe("QuickScanDialogComponent", () => {
  let component: QuickScanDialogComponent;
  let fixture: ComponentFixture<QuickScanDialogComponent>;
  let store: Store;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue("blob");
    TestBed.configureTestingModule({
    declarations: [QuickScanDialogComponent],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [ApiModule,
        NgxsModule.forRoot([AuthState, GroupState, LayoutState]),
        PipesModule,
        ReactiveFormsModule,
        SharedUiModule],
    providers: [
        {
            provide: ActivatedRoute,
            useValue: {},
        },
        {
            provide: AppDialog,
            useValue: {}
        },
        {
            provide: AppDialogRef<QuickScanDialogComponent>,
            useValue: {
                close: () => { },
            },
        },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
    ]
});
    fixture = TestBed.createComponent(QuickScanDialogComponent);
    store = TestBed.inject(Store);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  /** One household, id 2, with the given receipt settings; `auth` is the signed-in person's slice. */
  const seedHousehold = (settings: Record<string, unknown> = {}, auth: Record<string, unknown> = {}) => {
    store.reset({
      // The dialog's footer reads the layout slice, so a reset keeps it.
      ...store.snapshot(),
      auth,
      groups: { groups: [{ id: 2, name: "Home", isAllGroup: false, groupReceiptSettings: settings }], selectedGroupId: "", selectedDashboardId: "" },
    });
  };

  const twoHouseholds = (auth: Record<string, unknown> = {}, secondSettings: Record<string, unknown> = {}) => {
    store.reset({
      ...store.snapshot(),
      auth,
      groups: {
        groups: [
          { id: 7, name: "My Receipts", isAllGroup: false, groupReceiptSettings: { quickScanNoteEnabled: true } },
          { id: 8, name: "Household", isAllGroup: false, groupReceiptSettings: secondSettings },
        ],
        selectedGroupId: "",
        selectedDashboardId: "",
      },
    });
  };

  const spyOnScan = () =>
    vi.spyOn(TestBed.inject(ReceiptService), "quickScanReceipt").mockReturnValue(of(new HttpResponse({ body: {} })) as any);

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("starts with a household and a note per photo, and nothing else to fill in", () => {
    component.ngOnInit();

    expect(component.form.value).toEqual({ groupIds: [], notes: [] });
  });

  it("should push fileData into images when loaded", () => {
    const fileData = {} as ReceiptFileUploadCommand;
    component.fileLoaded(fileData);

    expect(component.images).toEqual([fileData]);
  });

  it("should close the dialog", () => {
    const dialogSpy = vi.spyOn(TestBed.inject(AppDialogRef), "close");

    component.cancelButtonClicked();

    expect(dialogSpy).toHaveBeenCalled();
  });

  it("should show error if no image has been selected", () => {
    const snackbarSpy = vi.spyOn(TestBed.inject(SnackbarService), "error");

    component.submitButtonClicked();

    expect(snackbarSpy).toHaveBeenCalledWith(
      "Please select images to upload"
    );
  });

  describe("the household of a photo", () => {
    it("is blank for someone with no household in the store and no default", () => {
      component.fileLoaded({} as any);

      expect(component.form.value).toEqual({ groupIds: [""], notes: [""] });
    });

    it("is the person's default household when they are in several", () => {
      twoHouseholds({ userPreferences: { quickScanDefaultGroupId: 8 } });

      component.fileLoaded({} as any);

      expect(component.groupIds.value).toEqual([8]);
    });

    it("is the person's only household, without the All group counting as a second", () => {
      store.reset({
        auth: {},
        groups: {
          groups: [
            { id: 1, name: "All Groups", isAllGroup: true },
            { id: 7, name: "My Receipts", isAllGroup: false },
          ],
          selectedGroupId: "",
          selectedDashboardId: "",
        },
      });

      component.fileLoaded({} as any);

      expect(component.groupIds.value).toEqual([7]);
    });

    it("is the person's only household even when their default names another, which could be stale", () => {
      seedHousehold({}, { userPreferences: { quickScanDefaultGroupId: 3 } });

      component.fileLoaded({} as any);

      expect(component.groupIds.value).toEqual([2]);
    });

    it("is left to pick for someone in several households, and the scan waits for it", () => {
      twoHouseholds();

      component.fileLoaded({} as any);

      expect(component.groupIds.value).toEqual([""]);
      expect(component.groupIds.at(0).valid).toBe(false);
      expect(component.form.invalid).toBe(true);
      // No household, no settings to follow: nothing but the picker shows.
      expect(component.showNote(0)).toBe(false);
    });

    it("refuses to send while a photo has no household", () => {
      twoHouseholds();
      const scan = spyOnScan();
      const snackbarSpy = vi.spyOn(TestBed.inject(SnackbarService), "error");

      component.fileLoaded({ file: { name: "a" } } as any);
      component.submitButtonClicked();

      expect(scan).not.toHaveBeenCalled();
      expect(snackbarSpy).toHaveBeenCalledWith("Please fill in all required fields. Some images are missing required fields.");
    });
  });

  describe("what a scan sends", () => {
    it("sends the photo, its household and the person scanning as the payer, and asks for nothing else", () => {
      seedHousehold({}, { userId: "5", userPreferences: { quickScanDefaultPaidById: 1 } });
      const scan = spyOnScan();
      const fileData = { file: { name: "a" } } as any;

      component.fileLoaded(fileData);
      component.submitButtonClicked();

      // Paid by is the scanner, not their stored default payer; the empty status lets the server apply the
      // household's default; categories and tags come from the product lines, so one empty entry each.
      expect(scan).toHaveBeenCalledWith([fileData.file], [2], [5], [""], [""], [""], [""], "events", true);
    });

    it("falls back on the person's default payer only when who is scanning is unknown", () => {
      seedHousehold({}, { userPreferences: { quickScanDefaultPaidById: 1 } });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);
      component.submitButtonClicked();

      expect(scan.mock.calls[0][2]).toEqual([1]);
    });

    it("sends the person's own default status", () => {
      seedHousehold({}, { userId: "5", userPreferences: { quickScanDefaultStatus: ReceiptStatus.Resolved } });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);
      component.submitButtonClicked();

      expect(scan.mock.calls[0][3]).toEqual([ReceiptStatus.Resolved]);
    });

    it("sends one entry per photo, in the order of the photos", () => {
      seedHousehold({ quickScanNoteEnabled: true }, { userId: "5" });
      const scan = spyOnScan();
      const first = { file: { name: "a" } } as any;
      const second = { file: { name: "b" } } as any;

      component.fileLoaded(first);
      component.fileLoaded(second);
      component.notes.at(1).setValue("second");
      component.submitButtonClicked();

      expect(scan).toHaveBeenCalledWith(
        [first.file, second.file], [2, 2], [5, 5], ["", ""], ["", ""], ["", ""], ["", "second"], "events", true
      );
    });

    it("closes and says the receipts were uploaded", () => {
      seedHousehold();
      spyOnScan();
      const close = vi.spyOn(TestBed.inject(AppDialogRef), "close");
      const success = vi.spyOn(TestBed.inject(SnackbarService), "success");

      component.fileLoaded({ file: { name: "a" } } as any);
      component.submitButtonClicked();

      expect(close).toHaveBeenCalled();
      expect(success).toHaveBeenCalledWith("Receipts uploaded. You will get a notification once the AI has read them, or if it fails.");
    });
  });

  it("shows the upload progress while sending, ignores a second click, and clears it on a failure", () => {
    seedHousehold();
    const events = new Subject<HttpEvent<any>>();
    const receiptService = TestBed.inject(ReceiptService);
    const serviceSpy = vi.spyOn(receiptService, "quickScanReceipt").mockReturnValue(events as any);

    component.fileLoaded({ file: { name: "a" } } as any);
    component.submitButtonClicked();
    expect(component.uploadStage()).toEqual({ stage: "uploading", percent: 0 });

    events.next({ type: HttpEventType.UploadProgress, loaded: 40, total: 100 });
    expect(component.uploadStage()).toEqual({ stage: "uploading", percent: 40 });

    component.submitButtonClicked();
    expect(serviceSpy).toHaveBeenCalledTimes(1);

    events.error(new Error("offline"));
    expect(component.uploadStage()).toBeNull();
  });

  describe("without a connection", () => {
    let events: Subject<HttpEvent<any>>;
    let queue: ReturnType<typeof vi.spyOn>;
    let close: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      seedHousehold({ quickScanNoteEnabled: true }, { userId: "5" });
      events = new Subject<HttpEvent<any>>();
      vi.spyOn(TestBed.inject(ReceiptService), "quickScanReceipt").mockReturnValue(events as any);
      queue = vi.spyOn(TestBed.inject(QueuedScanService), "queue").mockResolvedValue(undefined);
      close = vi.spyOn(TestBed.inject(AppDialogRef), "close");

      component.fileLoaded({ file: { name: "a" } } as any);
      component.notes.at(0).setValue("from the till");
      component.submitButtonClicked();
    });

    it("keeps the scan on the device, exactly as it was being sent, and closes", async () => {
      events.error(new HttpErrorResponse({ status: 0 }));
      await Promise.resolve();
      await Promise.resolve();

      expect(queue).toHaveBeenCalledTimes(1);
      expect(queue.mock.calls[0][0]).toEqual({
        files: [{ name: "a" }],
        groupIds: [2],
        paidByUserIds: [5],
        statuses: [""],
        categoryIds: [""],
        tagIds: [""],
        notes: ["from the till"],
      });
      expect(close).toHaveBeenCalled();
      expect(component.uploadStage()).toBeNull();
    });

    it("does not keep a scan the server answered, whatever the answer", () => {
      events.error(new HttpErrorResponse({ status: 400 }));

      expect(queue).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    });
  });

  describe("photo rows and drop zone", () => {
    it("lists each photo as its own attachment row and removes only that one", () => {
      seedHousehold({ quickScanNoteEnabled: true });
      component.fileLoaded({ file: { name: "a.jpg", size: 2048 } } as any);
      component.fileLoaded({ file: { name: "b.jpg", size: 3 * 1024 * 1024 } } as any);
      component.notes.at(1).setValue("the second photo's note");
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const rows = fixture.nativeElement.querySelectorAll('[data-testid="quick-scan-attachment"]');
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain("a.jpg");
      expect(rows[0].textContent).toContain("2 KB");
      expect(rows[1].textContent).toContain("3.0 MB");

      component.removeImage(0);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const left = fixture.nativeElement.querySelectorAll('[data-testid="quick-scan-attachment"]');
      expect(left.length).toBe(1);
      expect(left[0].textContent).toContain("b.jpg");
      expect(component.groupIds.length).toBe(1);
      // The note moves up with its photo.
      expect(component.notes.value).toEqual(["the second photo's note"]);
    });

    it("hands dropped files to the uploader and shows the drop state while dragging", () => {
      // The uploader is not declared in this spec, so its required view query has no value: stand one in.
      const processFiles = vi.fn().mockResolvedValue(undefined);
      (component as any).uploadImageComponent = () => ({ processFiles });
      const file = new File(["x"], "dropped.jpg", { type: "image/jpeg" });
      const preventDefault = vi.fn();

      component.onDragOver({ preventDefault } as any);
      expect(component.dragging()).toBe(true);
      component.onDragLeave();
      expect(component.dragging()).toBe(false);

      component.onDragOver({ preventDefault } as any);
      component.onDrop({ preventDefault, dataTransfer: { files: [file] } } as any);

      expect(preventDefault).toHaveBeenCalled();
      expect(component.dragging()).toBe(false);
      expect(processFiles).toHaveBeenCalledWith([file]);
    });
  });

  describe("the note", () => {
    const noteField = () => fixture.nativeElement.querySelector('[data-testid="quick-scan-note"]');

    const render = () => {
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
    };

    it("is not asked for unless the household switched it on", () => {
      seedHousehold();

      component.fileLoaded({ file: { name: "a" } } as any);
      render();

      expect(component.showNote(0)).toBe(false);
      expect(noteField()).toBeNull();
    });

    it("shows under the photo when the household asks for one, and can stay empty", () => {
      seedHousehold({ quickScanNoteEnabled: true });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);
      render();

      expect(component.showNote(0)).toBe(true);
      expect(noteField()).not.toBeNull();
      expect(component.notes.at(0).valid).toBe(true);

      component.submitButtonClicked();
      expect(scan).toHaveBeenCalled();
    });

    it("stays away while the household hides the note", () => {
      seedHousehold({ quickScanNoteEnabled: true, hideNote: true });

      component.fileLoaded({ file: { name: "a" } } as any);
      render();

      expect(component.showNote(0)).toBe(false);
      expect(noteField()).toBeNull();
    });

    it("travels with its photo", () => {
      seedHousehold({ quickScanNoteEnabled: true }, { userId: "5" });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);
      component.notes.at(0).setValue("Birthday dinner");
      component.submitButtonClicked();

      expect(scan.mock.calls[0][6]).toEqual(["Birthday dinner"]);
    });

    it("follows the photo's household: one typed for a household that asks is not sent to one that does not", () => {
      twoHouseholds({ userId: "5" });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);
      component.groupIds.at(0).setValue(7);
      expect(component.showNote(0)).toBe(true);
      component.notes.at(0).setValue("typed for the first household");

      component.groupIds.at(0).setValue(8);
      expect(component.showNote(0)).toBe(false);
      component.submitButtonClicked();

      expect(scan.mock.calls[0][1]).toEqual([8]);
      expect(scan.mock.calls[0][6]).toEqual([""]);
    });

    it("takes a note of the greatest length and refuses a longer one", () => {
      seedHousehold({ quickScanNoteEnabled: true });
      const scan = spyOnScan();

      component.fileLoaded({ file: { name: "a" } } as any);

      component.notes.at(0).setValue("a".repeat(RECEIPT_NOTE_MAX_LENGTH));
      expect(component.notes.at(0).valid).toBe(true);

      component.notes.at(0).setValue("a".repeat(RECEIPT_NOTE_MAX_LENGTH + 1));
      expect(component.notes.at(0).hasError("maxlength")).toBe(true);

      component.submitButtonClicked();
      expect(scan).not.toHaveBeenCalled();
    });

    // The server counts characters (runes); Validators.maxLength counts UTF-16 units and would refuse a note
    // of emoji the server takes.
    it("counts the length in characters, not UTF-16 units", () => {
      seedHousehold({ quickScanNoteEnabled: true });

      component.fileLoaded({ file: { name: "a" } } as any);

      component.notes.at(0).setValue("😀".repeat(RECEIPT_NOTE_MAX_LENGTH));
      expect(component.notes.at(0).valid).toBe(true);

      component.notes.at(0).setValue("😀".repeat(RECEIPT_NOTE_MAX_LENGTH + 1));
      expect(component.notes.at(0).hasError("maxlength")).toBe(true);
    });
  });
});
