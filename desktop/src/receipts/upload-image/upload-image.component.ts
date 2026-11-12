import { Component, inject, input, output, viewChild, ChangeDetectionStrategy } from "@angular/core";
import { take, tap } from "rxjs";
import { FormMode } from "src/enums/form-mode.enum";
import { marker } from "../../i18n/marker";
import { TranslationService } from "../../i18n/translation.service";
import { ReceiptFileUploadCommand } from "../../interfaces";
import { ReceiptImageService } from "../../open-api";
import { SnackbarService } from "../../services";
import { ProblemReporter } from "../../services/problem-reporter.service";
import { downscaleImageForUpload } from "../../utils/downscale-image";

/** What a file is by the end of its name, for a file the phone hands over without saying what it is. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

/**
 * Some Android file providers hand a photo over with an empty type. Such a file is given the type its name ends
 * with, so it is not left out for a missing label; one whose name says nothing either stays as it is.
 */
export function withKnownType(file: File): File {
  if (file.type) {
    return file;
  }
  const type = TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

@Component({
    selector: "app-upload-image",
    templateUrl: "./upload-image.component.html",
    styleUrls: ["./upload-image.component.scss"],
    changeDetection: ChangeDetectionStrategy.Eager
})
export class UploadImageComponent {
  private readonly snackbarService = inject(SnackbarService);

  private readonly translation = inject(TranslationService);

  private readonly problemReporter = inject(ProblemReporter);

  readonly uploadInput = viewChild.required<any>("uploadInput");

  public readonly receiptId = input<string | undefined>("");

  public readonly multiple = input<boolean>(true);

  public readonly acceptFileTypes = input<string[]>([
    "image/*",
    "application/pdf",
    "image/heic",
    "image/heif",
]);

  public readonly fileLoaded = output<ReceiptFileUploadCommand>();

  public formMode = FormMode;

  constructor(private receiptImageService: ReceiptImageService) {}

  public clickInput(): void {
    this.uploadInput().nativeElement.click();
  }

  public async onFileChange(event: any): Promise<void> {
    const files: File[] = Array.from(event?.target?.files ?? []);
    await this.processFiles(files);
    // Clearing the input lets the same photo be picked again after it was removed.
    if (event?.target) {
      event.target.value = "";
    }
  }

  /** Accepts files from the picker or from a drop: keeps the allowed types and emits each one as it is ready. */
  public async processFiles(files: File[]): Promise<void> {
    const typed = files.map(withKnownType);
    const acceptedFiles = typed.filter((f) => this.isAccepted(f));
    this.sayWhatWasLeftOut(typed.filter((f) => !this.isAccepted(f)));

    for (let i = 0; i < acceptedFiles.length; i++) {
      // A phone photo goes up as a smaller JPEG; anything it cannot shrink stays as picked.
      const f = await downscaleImageForUpload(acceptedFiles[i]);

      const command: ReceiptFileUploadCommand = {
        file: f,
        receiptId: Number(this.receiptId()),
      };

      if (f.type === "application/pdf" || f.type === "image/heic" || f.type === "image/heif") {
        this.receiptImageService
          .convertToJpg(f)
          .pipe(
            take(1),
            tap((encodedImage) => {
              command.encodedImage = encodedImage.encodedImage;
              this.fileLoaded.emit(command);
            })
          )
          .subscribe();
      } else {
        this.fileLoaded.emit(command);
      }
    }
  }

  private isAccepted(file: File): boolean {
    return this.acceptFileTypes().some((t) => new RegExp(t).test(file.type));
  }

  /**
   * A file that is not a photo or a PDF used to vanish without a word: nothing in the list, nothing said, nothing
   * logged. The person is told which file, and the server's log gets a line with what the phone called it.
   */
  private sayWhatWasLeftOut(files: File[]): void {
    for (const file of files) {
      this.snackbarService.error(
        this.translation.t(marker("{name} was left out: it is not a photo or a PDF."), { name: file.name || "?" })
      );
      this.problemReporter.report(
        "upload-file-left-out",
        `name ${JSON.stringify(file.name)}, type ${JSON.stringify(file.type)}, ${file.size} bytes`
      );
    }
  }
}
