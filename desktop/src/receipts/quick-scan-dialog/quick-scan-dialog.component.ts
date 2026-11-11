import { Component, OnInit, inject, signal, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { UploadStage, withUploadProgress } from "../../utils/upload-progress";
import { FormArray, FormBuilder, FormControl, FormGroup, Validators, ReactiveFormsModule } from "@angular/forms";
import { AppDialogRef } from "../../dialog/app-dialog";
import { Store } from "@ngxs/store";
import { finalize, take, tap } from "rxjs";
import { RECEIPT_NOTE_MAX_LENGTH } from "../../constants/receipt-note.constant";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { GroupReceiptSettings, ReceiptService, ReceiptStatus } from "../../open-api";
import { SnackbarService } from "../../services";
import { QueuedScan, QueuedScanService } from "../../services/queued-scan.service";
import { AuthState, GroupState } from "../../store";
import { codePointMaxLengthValidator } from "../../validators";
import { UploadImageComponent } from "../upload-image/upload-image.component";
import { quickScanAsksForNote } from "./quick-scan-field-config";
import { marker } from "../../i18n/marker";
import { buttonVariants } from "@spartan-ng/helm/button";
import { finePointerSignal } from "../../utils/fine-pointer";
import { DialogComponent } from "../../shared-ui/dialog/dialog.component";
import { AppIconComponent } from "../../shared-ui/icon/icon.component";
import { HlmAttachment } from "../../ui/attachment/lib/hlm-attachment";
import { HlmAttachmentMedia } from "../../ui/attachment/lib/hlm-attachment-media";
import { HlmAttachmentContent } from "../../ui/attachment/lib/hlm-attachment-content";
import { HlmAttachmentTitle } from "../../ui/attachment/lib/hlm-attachment-title";
import { HlmAttachmentDescription } from "../../ui/attachment/lib/hlm-attachment-description";
import { HlmAttachmentActions } from "../../ui/attachment/lib/hlm-attachment-actions";
import { BrnButton } from "@spartan-ng/brain/button";
import { HlmButton } from "../../ui/button/lib/hlm-button";
import { HlmAttachmentAction } from "../../ui/attachment/lib/hlm-attachment-action";
import { GroupAutocompleteComponent } from "../../shared-ui/group-autocomplete/group-autocomplete.component";
import { TextareaComponent } from "../../textarea/textarea/textarea.component";
import { UploadProgressComponent } from "../../shared-ui/upload-progress/upload-progress.component";
import { DialogFooterComponent } from "../../shared-ui/dialog-footer/dialog-footer.component";
import { TranslatePipe } from "../../i18n/translate.pipe";
import { FormGetPipe } from "../../pipes/form-get.pipe";

/**
 * Quick Scan: photos in, receipts out. Each photo becomes its own receipt, read by the AI. Nothing but the photo
 * is asked for: the person scanning paid, the receipt starts as "To check" (or the person's own default status),
 * and categories and tags come from the product lines once they are read. A person in several households picks
 * one per photo, and a household can add a note field (Receipt Settings); the note is never required.
 */
@Component({
    selector: "app-quick-scan-dialog",
    host: { class: "block" },
    templateUrl: "./quick-scan-dialog.component.html",
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [DialogComponent, ReactiveFormsModule, UploadImageComponent, AppIconComponent, HlmAttachment, HlmAttachmentMedia, HlmAttachmentContent, HlmAttachmentTitle, HlmAttachmentDescription, HlmAttachmentActions, BrnButton, HlmButton, HlmAttachmentAction, GroupAutocompleteComponent, TextareaComponent, UploadProgressComponent, DialogFooterComponent, TranslatePipe, FormGetPipe]
})
export class QuickScanDialogComponent implements OnInit {
  public readonly uploadImageComponent = viewChild.required(UploadImageComponent);

  public form: FormGroup = new FormGroup({});

  public images: ReceiptFileUploadCommand[] = [];

  // base-input has no built-in message for the maxlength error, so an unmapped one would render an empty
  // message. Held as a field rather than an inline object literal so the binding is stable.
  public readonly noteErrorMessages: { [key: string]: string } = {
    maxlength: marker("Note must be {requiredLength} characters or fewer."),
  };

  // The photo buttons are native labels around file inputs (mobile browsers ignore input.click() made after an
  // await), styled like buttons.
  protected readonly primaryButtonClass = buttonVariants({ variant: "default" });
  protected readonly outlineButtonClass = buttonVariants({ variant: "outline" });

  /** What the file picker offers: photos, PDFs and the iPhone formats. The upload component filters the same set. */
  protected readonly pickerAccept = "image/*,application/pdf,.heic,.heif";

  /** "Take a photo" opens the camera on a phone; with a mouse it would only be a second file picker. */
  protected readonly finePointer = finePointerSignal();

  // The group picker only shows when there is a choice to make.
  public readonly soleGroupId = this.store.selectSignal(GroupState.soleGroupId);

  private readonly queuedScans = inject(QueuedScanService);

  constructor(
    private dialogRef: AppDialogRef<QuickScanDialogComponent>,
    private formBuilder: FormBuilder,
    private receiptService: ReceiptService,
    private snackbarService: SnackbarService,
    private store: Store
  ) {}

  public get groupIds(): FormArray {
    return this.form.get("groupIds") as FormArray;
  }

  public get notes(): FormArray {
    return this.form.get("notes") as FormArray;
  }

  public ngOnInit(): void {
    this.form = this.formBuilder.group({
      groupIds: this.formBuilder.array<number>([]),
      notes: this.formBuilder.array<string>([]),
    });
  }

  public fileLoaded(fileData: ReceiptFileUploadCommand): void {
    if (fileData.file && !fileData.encodedImage) {
      fileData.url = URL.createObjectURL(fileData.file);
    }
    this.images.push(fileData);
    const userPreferences = this.store.selectSnapshot(AuthState.userPreferences);

    // A member of exactly one household has no choice to make, so it is seeded and its picker hidden, ahead of
    // the person's default household, which could be stale.
    this.groupIds.push(new FormControl(
      this.store.selectSnapshot(GroupState.soleGroupId)
        ?? userPreferences?.quickScanDefaultGroupId
        ?? "",
      Validators.required
    ));
    // Counted in characters like the server does: Validators.maxLength counts UTF-16 units and would refuse a
    // note of emoji the server takes.
    this.notes.push(new FormControl("", codePointMaxLengthValidator(RECEIPT_NOTE_MAX_LENGTH)));
  }

  // Returns the receipt settings for the household currently selected on the given photo, if any.
  public settingsForIndex(index: number): GroupReceiptSettings | undefined {
    const groupId = this.groupIds.at(index)?.value;
    if (!groupId) {
      return undefined;
    }

    return this.store.selectSnapshot(GroupState.getGroupById(groupId.toString()))?.groupReceiptSettings;
  }

  /**
   * Whether this photo's household asks for a note. Resolved per call rather than kept per index: removing a
   * photo shifts every later one down, and the household of a photo can change.
   */
  public showNote(index: number): boolean {
    return quickScanAsksForNote(this.settingsForIndex(index), !!this.groupIds.at(index)?.value);
  }

  /** True while a file is dragged over the drop zone, so it can show it will take it. */
  public readonly dragging = signal(false);

  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  public onDragLeave(): void {
    this.dragging.set(false);
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.uploadImageComponent().processFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  /** "1.4 MB" style size for the photo's row. */
  public fileSize(image: ReceiptFileUploadCommand): string {
    const bytes = image.file?.size ?? 0;
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  /** Photos taken or chosen with either button go the same way as dropped ones. */
  public filesPicked(event: Event): void {
    void this.uploadImageComponent().onFileChange(event);
  }

  public removeImage(index: number): void {
    this.groupIds.removeAt(index);
    this.notes.removeAt(index);
    this.images.splice(index, 1);
  }

  /** Where the upload stands, for the progress bar above the footer; null while nothing is being sent. */
  public readonly uploadStage = signal<UploadStage | null>(null);

  public submitButtonClicked(): void {
    if (this.uploadStage() !== null) {
      return;
    }
    if (this.form.valid && this.images.length > 0) {
      const scan = this.buildScan();

      this.uploadStage.set({ stage: "uploading", percent: 0 });
      withUploadProgress(
        this.receiptService
        .quickScanReceipt(
          scan.files,
          scan.groupIds,
          scan.paidByUserIds,
          scan.statuses,
          scan.categoryIds,
          scan.tagIds,
          scan.notes,
          "events",
          true
        ),
        (stage) => this.uploadStage.set(stage)
      )
        .pipe(
          take(1),
          tap(() => {
            this.snackbarService.success(
              marker("Receipts uploaded. You will get a notification once the AI has read them, or if it fails.")
            );
            this.dialogRef.close();
          }),
          // A refused or failed upload (the interceptor already reports it) leaves the dialog open and the bar away.
          finalize(() => this.uploadStage.set(null))
        )
        .subscribe({
          error: (error: unknown) => {
            // No connection at the till: the photos stay on this device and go up by themselves later.
            if (QueuedScanService.shouldQueue(error)) {
              void this.queuedScans.queue(scan).then(() => {
                this.snackbarService.info(
                  marker("No connection. The photos are kept on this device and uploaded when the connection is back.")
                );
                this.dialogRef.close();
              });
            }
          },
        });
    }
    if (this.images.length === 0) {
      this.snackbarService.error("Please select images to upload");
    }
    if (this.form.invalid) {
      this.snackbarService.error("Please fill in all required fields. Some images are missing required fields.");
    }
  }

  /**
   * The scan as it is sent, kept as one value in case it cannot be sent: the form may change while the upload
   * runs. Per photo: the person scanning paid (their own default payer only when who they are is unknown), the
   * status is their own default or empty for the household's, and a note travels only where the household asks
   * for one, so a note typed before switching to another household is not sent to it.
   */
  private buildScan(): QueuedScan {
    const userPreferences = this.store.selectSnapshot(AuthState.userPreferences);
    const paidBy = (Number(this.store.selectSnapshot(AuthState.userId)) || userPreferences?.quickScanDefaultPaidById || "") as number;
    const status = (userPreferences?.quickScanDefaultStatus ?? "") as ReceiptStatus;

    return {
      files: this.images.map((image) => image.file),
      groupIds: [...this.groupIds.value],
      paidByUserIds: this.images.map(() => paidBy),
      statuses: this.images.map(() => status),
      // One empty entry per photo: receipt-level categories and tags are not picked here any more.
      categoryIds: this.images.map(() => ""),
      tagIds: this.images.map(() => ""),
      notes: this.images.map((_image, index) => (this.showNote(index) ? String(this.notes.at(index).value ?? "") : "")),
    };
  }

  public cancelButtonClicked(): void {
    this.dialogRef.close();
  }
}
